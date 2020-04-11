#!/bin/sh
env

if [ ( -z "$MAIL" ) -o ( -z "$USER" ) -o ( -z "$PASS" ) ]; then
    echo "Usage: USER=root MAIL=root@example.com PASS=CHANGEME $0"
    exit 1
fi

URL="http://localhost:8065"

set -e
mattermost user create --system_admin --firstname "$USER" --email "$MAIL" --username "$USER" --password "$PASS"

declare $(curl -s -i -d "{\"login_id\":\"${USER}\",\"password\":\"${PASS}\"}' "${URL}/api/v4/users/login" | sed 's/^.*"id":"\([[:alnum:]]*\)".*$/id=\1/' | sed 's/token:[[:space:]]*\([[:alnum:]]*\)/token=\1/' | grep '=' | tr '\n' ' ' | tr '\r' ' ')
curl -s -H "Authorization: Bearer ${token}" -d '{"description": "LTI Bridge"}' "${URL}/api/v4/users/${id}/tokens" | sed 's/^.*"id":"\([[:alnum:]]*\)","token":"\([[:alnum:]]*\)".*$/\nOAUTH_ID=\1\nOAUTH_TOKEN=\2\n/'
