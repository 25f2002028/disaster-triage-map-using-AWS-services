import boto3, uuid
from decimal import Decimal
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2

dynamodb = boto3.resource('dynamodb')
reports_table = dynamodb.Table('Reports')
incidents_table = dynamodb.Table('Incidents')

AREA_TYPE_CATEGORIES = {'gas_leak': 200, 'chemical_spill': 500, 'flood': 1000, 'fire': 300}


def haversine_m(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = float(lat1), float(lng1), float(lat2), float(lng2)
    R = 6371000
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def calculate_trust_score(report):
    score = 0
    source_weights = {'responder': 40, 'verified_volunteer': 25, 'citizen': 10, 'unverified': 5}
    score += source_weights.get(report.get('source_type'), 5)

    media_weights = {'video': 30, 'photo': 20, 'text': 5}
    score += media_weights.get(report.get('media_type'), 5)

    score += 10  # freshness placeholder
    return min(score, 100)


def find_matching_incident(report):
    response = incidents_table.scan()
    for incident in response['Items']:
        if incident.get('category') != report.get('category'):
            continue
        incident_location = incident.get('location')
        report_location = report.get('location')
        if not incident_location or not report_location:
            continue
        dist = haversine_m(
            report_location['lat'], report_location['lng'],
            incident_location['lat'], incident_location['lng']
        )
        threshold = float(incident.get('radius_m', 200))
        if dist <= threshold:
            return incident['incident_id']
    return None


def create_new_incident(report):
    category = report.get('category', 'unknown')
    incident_type = 'area' if category in AREA_TYPE_CATEGORIES else 'point'
    radius_m = AREA_TYPE_CATEGORIES.get(category, 0)

    incident_id = str(uuid.uuid4())

    incidents_table.put_item(Item={
        'incident_id': incident_id,
        'category': category,
        'incident_type': incident_type,
        'location': report.get('location'),
        'radius_m': Decimal(str(radius_m)),
        'severity': report.get('severity_claimed', 'unknown'),
        'aggregate_confidence': Decimal(str(report.get('trust_score', 0))),
        'corroboration_count': 1,
        'priority_score': Decimal('0'),
        'status': 'new',
        'assigned_to': None,
        'status_timeline': [{
            'action': 'status_change',
            'by': 'system',
            'from': None,
            'to': 'new',
            'reason': 'Auto-created from first report',
            'timestamp': datetime.now(timezone.utc).isoformat()
        }],
        'linked_report_ids': [report['report_id']],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    })

    return incident_id


def expand_radius_if_needed(incident, new_report_location):
    if incident.get('incident_type') != 'area' or not new_report_location:
        return incident.get('radius_m', 0)

    dist = haversine_m(
        incident['location']['lat'], incident['location']['lng'],
        new_report_location['lat'], new_report_location['lng']
    )
    current_radius = float(incident.get('radius_m', 0))
    if dist > current_radius:
        return Decimal(str(dist))
    return incident['radius_m']


def link_report_to_incident(incident_id, report):
    incident = incidents_table.get_item(Key={'incident_id': incident_id})['Item']

    linked_reports = incident.get('linked_report_ids', [])
    if report['report_id'] not in linked_reports:
        linked_reports.append(report['report_id'])

    new_radius = expand_radius_if_needed(incident, report.get('location'))

    incidents_table.update_item(
        Key={'incident_id': incident_id},
        UpdateExpression='SET linked_report_ids = :r, corroboration_count = :c, radius_m = :rad, updated_at = :u',
        ExpressionAttributeValues={
            ':r': linked_reports,
            ':c': len(linked_reports),
            ':rad': new_radius,
            ':u': datetime.now(timezone.utc).isoformat()
        }
    )


def lambda_handler(event, context):
    for record in event.get('Records', []):
        if record['eventName'] != 'INSERT':
            continue

        new_image = record['dynamodb']['NewImage']
        report_id = new_image['report_id']['S']

        report = reports_table.get_item(Key={'report_id': report_id})['Item']

        trust_score = calculate_trust_score(report)
        report['trust_score'] = trust_score

        matched_incident_id = find_matching_incident(report)

        if matched_incident_id:
            link_report_to_incident(matched_incident_id, report)
        else:
            matched_incident_id = create_new_incident(report)

        reports_table.update_item(
            Key={'report_id': report_id},
            UpdateExpression='SET trust_score = :t, incident_id = :i',
            ExpressionAttributeValues={':t': Decimal(str(trust_score)), ':i': matched_incident_id}
        )

    return {'statusCode': 200}