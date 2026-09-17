import boto3, json
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
incidents_table = dynamodb.Table('Incidents')
reports_table = dynamodb.Table('Reports')


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def get_description_for_incident(incident):
    """Pull the first linked report's description, if any exist."""
    linked_ids = incident.get('linked_report_ids', [])
    if not linked_ids:
        return None
    try:
        result = reports_table.get_item(Key={'report_id': linked_ids[0]})
        report = result.get('Item')
        if report and report.get('description'):
            return report['description']
    except Exception:
        pass
    return None


def lambda_handler(event, context):
    response = incidents_table.scan()
    incidents = response.get('Items', [])

    for incident in incidents:
        desc = get_description_for_incident(incident)
        incident['description'] = desc or f"{incident.get('category', 'unknown')} incident"

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(incidents, default=decimal_default)
    }
