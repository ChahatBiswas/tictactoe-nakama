#!/bin/bash
# Run this script on a fresh Ubuntu 22.04 DigitalOcean Droplet (min $6/mo, 1GB RAM)

set -e

# 1. Install Docker
apt-get update -y
apt-get install -y docker.io docker-compose curl

# 2. Create project directory
mkdir -p /opt/nakama && cd /opt/nakama

# 3. Copy server build files (run from your local machine first: npm run build in server/)
# scp -r ./server/build root@<DROPLET_IP>:/opt/nakama/modules

# 4. Write docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: "3"
services:
  cockroachdb:
    image: cockroachdb/cockroach:latest-v23.1
    command: start-single-node --insecure --store=attrs=ssd,path=/var/lib/cockroach/
    volumes:
      - data:/var/lib/cockroach
    expose:
      - "8080"
      - "26257"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health?ready=1"]
      interval: 3s
      timeout: 3s
      retries: 5

  nakama:
    image: registry.heroiclabs.com/heroiclabs/nakama:3.22.0
    entrypoint:
      - "/bin/sh"
      - "-ecx"
      - >
        /nakama/nakama migrate up --database.address root@cockroachdb:26257 &&
        exec /nakama/nakama
        --name nakama1
        --database.address root@cockroachdb:26257
        --logger.level INFO
        --session.token_expiry_sec 7200
        --runtime.js_entrypoint "/nakama/data/modules/index.js"
    volumes:
      - ./modules:/nakama/data/modules
    ports:
      - "7349:7349"
      - "7350:7350"
      - "7351:7351"
    depends_on:
      cockroachdb:
        condition: service_healthy
    restart: unless-stopped

volumes:
  data:
EOF

# 5. Start
docker-compose up -d

echo "Nakama is running on port 7350"
echo "Console: http://$(curl -s ifconfig.me):7350 (admin/admin)"
