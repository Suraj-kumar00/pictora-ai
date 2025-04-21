# Docker Setup for Pictora AI

This directory contains Docker-related files to containerize the Pictora AI application. The setup includes multi-stage builds for both frontend and backend services, secure handling of environment variables, and health checks for robust container orchestration.

## Getting Started

### Prerequisites

- Docker Engine 20.10+
- Docker Compose V2
- Git

### Setup Instructions

1. Clone the repository
   ```bash
   git clone https://github.com/yourorganization/pictora-ai.git
   cd pictora-ai
   ```

2. Set up secrets
   ```bash
   chmod +x docker/setup-secrets.sh
   ./docker/setup-secrets.sh
   ```
   This script will create the necessary secret files in the `secrets` directory based on your `.env` file.

3. Build and start the containers
   ```bash
   docker compose up -d
   ```

4. Verify that all services are running properly
   ```bash
   docker compose ps
   ```

## Architecture

- **Frontend**: Next.js application running in a Bun environment
- **Backend**: Express API running in a Bun environment
- **Database**: PostgreSQL database with persistent storage

## Environment Variables

Environment variables are handled securely using Docker secrets and `.env` file:

1. Sensitive secrets (passwords, API keys) are stored in Docker secrets
2. Non-sensitive configuration is passed via environment variables
3. The `.env` file is used for local development

## Security Best Practices

1. Multi-stage builds to minimize image size and attack surface
2. Non-root users for running applications
3. Dockerfile security scanning with Trivy
4. Secrets management with Docker secrets
5. Health checks for all services
6. Alpine-based images where possible

## Troubleshooting

### Health Checks

Each service has health checks configured. You can check the status with:

```bash
docker compose ps
```

Look for the "Health" column to see if services are healthy.

### Logs

To view logs for a specific service:

```bash
docker compose logs -f <service-name>
```

### Common Issues

1. **Frontend cannot connect to backend**: Ensure backend service is healthy and the `NEXT_PUBLIC_BACKEND_URL` environment variable is correctly set.

2. **Backend cannot connect to database**: Check the PostgreSQL health status and verify that the database credentials in secrets are correct.

3. **Missing environment variables**: Make sure all required environment variables are set either in the `.env` file or through Docker secrets.

## Production Deployment

For production deployments:

1. Set up proper Docker secrets in your production environment
2. Use the GitHub Actions workflows to build and push images to DockerHub
3. Configure a reverse proxy (like Nginx or Traefik) with HTTPS
4. Set up proper network security groups and firewall rules 