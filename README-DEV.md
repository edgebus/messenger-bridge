# Developer Notes

## Launch the service locally

1. `npm install`
1. `npm run build`
1. `cp .env-example .env`
1. Set values in the `.env` file
1. `npm start`

## Test Case 1: Ask for approvement in topic DeployProduction

1. Create an approvement
    ```shell
    curl \
      --verbose \
      --request POST \
      --header 'Content-Type: application/json' \
      --data '{"appName":"myApp","appVersion":"0.1.0-rc00"}' \
      http://127.0.0.1:8080/v1/approvement/DeployProduction

    Note: Unnecessary use of -X or --request, POST is already inferred.
    *   Trying 127.0.0.1:8080...
    * Connected to 127.0.0.1 (127.0.0.1) port 8080
    > POST /v1/approvement/DeployProduction HTTP/1.1
    > Host: 127.0.0.1:8080
    > User-Agent: curl/8.6.0
    > Accept: */*
    > Content-Type: application/json
    > Content-Length: 45
    > 
    < HTTP/1.1 200 OK
    < Date: Wed, 05 Mar 2025 20:50:57 GMT
    < Connection: keep-alive
    < Keep-Alive: timeout=5
    < Transfer-Encoding: chunked
    < 
    {
    "approvementId": "72f85dcc-702f-416e-9095-773cb2c6caef"
    }
    * Leftovers after chunking: 11 bytes
    * Connection #0 to host 127.0.0.1 left intact
    ```
1. Take a look in Telegram for a message (DO NOT ANSWER AT THE MOMENT)
1. Fetch approvement status
    ```shell
    curl \
      --verbose \
      --request GET \
      --data '{"appName":"myApp","appVersion":"0.1.0-rc00"}' \
      http://127.0.0.1:8080/v1/approvement/DeployProduction/72f85dcc-702f-416e-9095-773cb2c6caef

    *   Trying 127.0.0.1:8080...
    * Connected to 127.0.0.1 (127.0.0.1) port 8080
    > GET /v1/approvement/DeployProduction/72f85dcc-702f-416e-9095-773cb2c6caef HTTP/1.1
    > Host: 127.0.0.1:8080
    > User-Agent: curl/8.6.0
    > Accept: */*
    > Content-Length: 45
    > Content-Type: application/x-www-form-urlencoded
    > 
    < HTTP/1.1 200 OK
    < Date: Wed, 05 Mar 2025 20:59:15 GMT
    < Connection: keep-alive
    < Keep-Alive: timeout=5
    < Transfer-Encoding: chunked
    < 
    {
            "approvementId": "72f85dcc-702f-416e-9095-773cb2c6caef",
            "topic": "DeployProduction",
            "requireVotes": 1,
            "expireAt": "2025-03-05T21:50:57.457Z",
            "status": "PENDING",
            "approvedBy": [],
            "refuseBy": null
    }
    * Leftovers after chunking: 11 bytes
    * Connection #0 to host 127.0.0.1 left intact
    ```
1. Press a decision button on the message in Telegram (for example Reject). Buttons in the message should disappear (replaces by text `Refused by: @theanurin`)
1. Fetch approvement status again
    ```shell
    curl \
      --verbose \
      --request GET \
      --data '{"appName":"myApp","appVersion":"0.1.0-rc00"}' \
      http://127.0.0.1:8080/v1/approvement/DeployProduction/72f85dcc-702f-416e-9095-773cb2c6caef

    *   Trying 127.0.0.1:8080...
    * Connected to 127.0.0.1 (127.0.0.1) port 8080
    > GET /v1/approvement/DeployProduction/72f85dcc-702f-416e-9095-773cb2c6caef HTTP/1.1
    > Host: 127.0.0.1:8080
    > User-Agent: curl/8.6.0
    > Accept: */*
    > Content-Length: 45
    > Content-Type: application/x-www-form-urlencoded
    > 
    < HTTP/1.1 200 OK
    < Date: Wed, 05 Mar 2025 21:02:23 GMT
    < Connection: keep-alive
    < Keep-Alive: timeout=5
    < Transfer-Encoding: chunked
    < 
    {
            "approvementId": "72f85dcc-702f-416e-9095-773cb2c6caef",
            "topic": "DeployProduction",
            "requireVotes": 1,
            "expireAt": "2025-03-05T21:50:57.457Z",
            "status": "REFUSED",
            "approvedBy": [],
            "refuseBy": {
                    "username": "theanurin",
                    "chat_id": "867014308",
                    "chat_type": "private",
                    "message_id": 69,
                    "createdAt": "2025-03-05T20:50:57.000Z",
                    "source": "telegram"
            }
    }
    * Leftovers after chunking: 12 bytes
    * Connection #0 to host 127.0.0.1 left intact
    ```
1. As we may see above, an user `theanurin` make decision to `REFUSE` the approvement.
