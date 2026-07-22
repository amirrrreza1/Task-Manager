#!/bin/sh
set -eu

npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
exec "$@"
