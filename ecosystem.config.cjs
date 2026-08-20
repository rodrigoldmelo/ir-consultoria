// PM2 só da IR. Nunca inclua a Lis (`conversa-hub-api`) aqui:
// `pm2 start ecosystem.config.cjs` deve adicionar um processo, não mexer no outro.
module.exports = {
  apps: [
    {
      name: "ir-consultoria-api",
      cwd: "/opt/ir-consultoria",
      // Chamar o tsx direto evita o npm intermediário, que às vezes sobrevive
      // ao restart e deixa dois processos escutando a mesma porta.
      script: "./node_modules/.bin/tsx",
      args: "backend/index.ts",
      // fork + 1 instância: em cluster os workers de template/drip rodariam duplicados.
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: 3010,
        IR_APP_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "400M",
      time: true,
      watch: false,
      autorestart: true,
    },
  ],
};
