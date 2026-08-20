#!/usr/bin/env bash
# Auditoria SOMENTE LEITURA da VPS antes de instalar a IR ao lado da Lis.
# Não instala, não edita, não reinicia nada.
#
# Rodar da máquina local, sem copiar arquivo para o servidor:
#   ssh root@IP_DA_VPS 'bash -s' < scripts/vps-audit.sh
set -uo pipefail

line() { printf '\n=== %s ===\n' "$1"; }

line "Sistema"
uname -a
[ -r /etc/os-release ] && . /etc/os-release && echo "distro: ${PRETTY_NAME:-?}"

line "Recursos (segundo processo Node cabe aqui?)"
free -m 2>/dev/null || vm_stat 2>/dev/null | head -5
df -h / | tail -1

line "Node / npm / pm2"
command -v node >/dev/null && node -v || echo "node ausente"
command -v npm >/dev/null && npm -v || echo "npm ausente"
command -v pm2 >/dev/null && pm2 -v || echo "pm2 ausente"

line "Processos PM2 (Lis precisa estar online ANTES de qualquer mudança)"
command -v pm2 >/dev/null && pm2 list || echo "pm2 ausente"

line "Portas em escuta (3001 = Lis; 3010 precisa estar LIVRE)"
if command -v ss >/dev/null; then
  ss -ltnp
else
  netstat -ltnp 2>/dev/null || echo "ss/netstat ausentes"
fi

line "Porta 3010 livre?"
if (command -v ss >/dev/null && ss -ltn | grep -q ':3010 ') ||
   (command -v netstat >/dev/null && netstat -ltn 2>/dev/null | grep -q ':3010 '); then
  echo "OCUPADA — escolher outra porta para a IR"
else
  echo "livre"
fi

line "Health da Lis (baseline; repetir igual no fim do deploy)"
curl -sS --max-time 5 http://127.0.0.1:3001/api/health || echo "sem resposta em 3001"
echo

line "Diretórios em /opt"
ls -la /opt 2>/dev/null | head -20
echo "--- /opt/ir-consultoria já existe?"
[ -d /opt/ir-consultoria ] && echo "SIM (conferir conteúdo antes de sincronizar)" || echo "não"

line "Nginx: sites habilitados"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "sem /etc/nginx/sites-enabled"

line "Nginx: server_name e certificados já configurados"
grep -RhE 'server_name|ssl_certificate|listen|proxy_pass' /etc/nginx/sites-enabled/ 2>/dev/null |
  sed 's/^[[:space:]]*//' | sort -u

line "Nginx: config válida agora (baseline)"
nginx -t 2>&1 || echo "nginx -t falhou"

line "Certificados existentes"
ls -la /etc/letsencrypt/live/ 2>/dev/null || echo "sem letsencrypt"
ls -la /etc/ssl/cloudflare* /etc/nginx/ssl 2>/dev/null || echo "sem cert Cloudflare Origin aparente"

line "Firewall"
command -v ufw >/dev/null && ufw status verbose || echo "ufw ausente"
command -v iptables >/dev/null && iptables -S 2>/dev/null | head -20

line "FIM — nada foi alterado"
