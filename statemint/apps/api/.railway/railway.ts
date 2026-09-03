import { defineRailway, github, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Redis = redis("Redis", { region: "ams" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  const Postgres = postgres("Postgres", { region: "ams" });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "ams", sizeMB: 500 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "ams", sizeMB: 500 });
  const api = service("api", {
    source: github("lekedev/Statemint", { branch: "fix-harden-deploy", checkSuites: false, rootDirectory: "/statemint/apps/api" }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "/statemint/apps/api/Dockerfile" },
    replicas: { "ams": 1 },
    env: { DATABASE_URL: preserve(), FRONTEND_URL: preserve(), HF_API_TOKEN: preserve(), HF_CATEGORIZATION_MODEL: preserve(), HF_EMBEDDING_MODEL: preserve(), JWT_EXPIRES_IN: preserve(), JWT_SECRET: preserve(), NODE_ENV: preserve(), PORT: preserve(), REDIS_URL: preserve(), UPLOAD_DIR: preserve() },
  });
  const worker = service("worker", {
    source: github("lekedev/Statemint", { branch: "fix-harden-deploy", checkSuites: false, rootDirectory: "/statemint/apps/api" }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "/statemint/apps/api/Dockerfile.worker" },
    replicas: { "ams": 1 },
    env: { DATABASE_URL: preserve(), HF_API_TOKEN: preserve(), HF_CATEGORIZATION_MODEL: preserve(), HF_EMBEDDING_MODEL: preserve(), JWT_EXPIRES_IN: preserve(), JWT_SECRET: preserve(), NODE_ENV: preserve(), PORT: preserve(), REDIS_URL: preserve(), UPLOAD_DIR: preserve() },
  });

  return project("serene-healing", {
    resources: [api, worker, Redis, Postgres, postgresVolume, redisVolume],
  });
});
