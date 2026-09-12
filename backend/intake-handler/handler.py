import boto3, uuid, json
from decimal import Decimal
from datetime import datetime, timezone

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
reports_table = dynamodb.Table('Reports')

BUCKET_NAME = 'disaster-triage-reports-itworks'

def lambda_handler(event, context):
    body = json.loads(event['body']) if 'body' in event else event

    report_id = str(uuid.uuid4())
    evidence_key = f"reports/{report_id}/evidence"

    # Convert location floats to Decimal (DynamoDB requirement)
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
        'evidence_s3_key': evidence_key,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'trust_score': None
    })

    return {'statusCode': 200, 'body': json.dumps({'report_id': report_id})}