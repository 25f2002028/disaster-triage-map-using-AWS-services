import boto3, json
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
incidents_table = dynamodb.Table('Incidents')


def lambda_handler(event, context):
    incident_id = event['pathParameters']['id']
    body = json.loads(event['body'])

    incident = incidents_table.get_item(Key={'incident_id': incident_id})['Item']
    timeline = incident.get('status_timeline', [])

    update_expr_parts = []
    expr_values = {}
    expr_names = {}

    if 'assigned_to' in body:
        update_expr_parts.append('assigned_to = :a')
        expr_values[':a'] = body['assigned_to']

    if 'status' in body:
        update_expr_parts.append('#s = :st')
        expr_values[':st'] = body['status']
        expr_names['#s'] = 'status'

    timeline.append({
        'action': body.get('action', 'status_change'),
        'by': body.get('changed_by', 'unknown'),
        'from': body.get('previous_status'),
        'to': body.get('status'),
        'reason': body.get('reason'),
        'timestamp': datetime.now(timezone.utc).isoformat()
    })
    update_expr_parts.append('status_timeline = :tl')
    expr_values[':tl'] = timeline
    update_expr_parts.append('updated_at = :u')
    expr_values[':u'] = datetime.now(timezone.utc).isoformat()

    kwargs = {
        'Key': {'incident_id': incident_id},
        'UpdateExpression': 'SET ' + ', '.join(update_expr_parts),
        'ExpressionAttributeValues': expr_values
    }
    if expr_names:
        kwargs['ExpressionAttributeNames'] = expr_names

    incidents_table.update_item(**kwargs)

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True})
    }
