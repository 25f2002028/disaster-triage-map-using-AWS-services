import boto3
from decimal import Decimal
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
incidents_table = dynamodb.Table('Incidents')

SEVERITY_WEIGHTS = {'critical': 40, 'high': 30, 'medium': 20, 'low': 10}


def calculate_priority(incident):
    severity_weight = SEVERITY_WEIGHTS.get(incident.get('severity'), 10)
    trust_weight = float(incident.get('aggregate_confidence', 0)) * 0.3
    corroboration_weight = min(float(incident.get('corroboration_count', 0)) * 5, 20)
    area_weight = 10 if incident.get('incident_type') == 'area' else 0
    return round(severity_weight + trust_weight + corroboration_weight + area_weight, 2)


def lambda_handler(event, context):
    for record in event.get('Records', []):
        if record['eventName'] not in ('INSERT', 'MODIFY'):
            continue

        new_image = record['dynamodb']['NewImage']
        incident_id = new_image['incident_id']['S']

        incident = incidents_table.get_item(Key={'incident_id': incident_id})['Item']

        new_priority = calculate_priority(incident)
        current_priority = float(incident.get('priority_score', -1))

        if new_priority == current_priority:
            continue

        incidents_table.update_item(
            Key={'incident_id': incident_id},
            UpdateExpression='SET priority_score = :p, updated_at = :u',
            ExpressionAttributeValues={
                ':p': Decimal(str(new_priority)),
                ':u': datetime.now(timezone.utc).isoformat()
            }
        )

    return {'statusCode': 200}
