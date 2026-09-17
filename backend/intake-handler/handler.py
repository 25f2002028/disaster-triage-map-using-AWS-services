import boto3, uuid, json
from decimal import Decimal
from datetime import datetime, timezone

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
reports_table = dynamodb.Table('Reports')

BUCKET_NAME = 'disaster-triage-reports-itworks'

def lambda_handler(event, context):
    body = json.loads(event['body']) if 'body' in event else event

    # Use the client-generated ID when present, so offline-queue retries
    # overwrite the same item instead of creating duplicate reports.
    report_id = body.get('client_report_id') or str(uuid.uuid4())
    evidence_key = f"reports/{report_id}/evidence"

    raw_location = body.get('location')
    location = None
    if raw_location:
        location = {
            'lat': Decimal(str(raw_location['lat'])),
            'lng': Decimal(str(raw_location['lng']))
        }

    reports_table.put_item(Item={
        'report_id': report_id,
        'incident_id': None,
        'source_type': body.get('source_type', 'citizen'),
        'media_type': body.get('media_type', 'text'),
        'location': location,
        'description': body.get('description', ''),
        'severity_claimed': body.get('severity', 'unknown'),
        'category': body.get('category', 'unknown'),
        'client_timestamp': body.get('client_timestamp'),
        'evidence_s3_key': evidence_key,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'trust_score': None
    })

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'report_id': report_id})
    }