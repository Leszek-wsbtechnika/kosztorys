FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
# Kopiujemy tylko index.html — CLAUDE.md / PLAN.md nie trafiają do serwowanego katalogu
COPY index.html /srv/index.html

EXPOSE 80
