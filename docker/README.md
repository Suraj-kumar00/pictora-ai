# Docker Setup for Pictora AI

This directory contains Docker-related files to containerize the Pictora AI application. The setup includes Docker configurations for the frontend, backend, and PostgreSQL database services.

## Getting Started

### Prerequisites

- Docker Engine 20.10+
- Docker Compose V2
- Git

### Setup Instructions

1. Clone the repository and navigate to the project directory

   ```bash
   git clone https://github.com/yourorganization/pictora-ai.git
   cd pictora-ai
   ```

2. Create a `.env` file in the root directory with required environment variables:

   ```
   # Database - IMPORTANT: This is the exact URL that will be used by the backend
   DATABASE_URL=postgresql://myuser:mypassword@postgres:5432/pictoraai

   # Backend
   NODE_ENV=production
   PORT=8000

   # Frontend
   NEXT_PUBLIC_BACKEND_URL=http://backend:8000

   # Add other required environment variables for your application
   ```

   > **Note**: Make sure the DATABASE_URL is correct and points to the postgres service with the proper credentials. The backend container will use this exact connection string.

3. Build and start the containers

   ```bash
   docker compose up -d
   ```

4. Verify that all services are running properly

   ```bash
   docker compose ps
   ```

5. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

## Container Architecture

- **Frontend**: Next.js application running in a Bun environment on port 3000
- **Backend**: Express API running in a Bun environment on port 8000
- **Database**: PostgreSQL database on port 5433 (mapped to 5432 inside container)

All services run on a custom Docker network called `pictora-network` which provides isolated communication between containers.

## Environment Variables

The application uses two methods for environment configuration:

1. `.env` file in the root directory, which gets loaded by both frontend and backend containers
   - The DATABASE_URL in this file is used directly by the backend service
2. Container-specific environment variables defined in the docker-compose.yml file

## Network Configuration

The application uses a custom Docker network for improved security and isolation:

- Network name: `pictora-network`
- Network type: bridge
- All services (postgres, backend, and web) are connected to this network
- Services can communicate with each other using their service names as hostnames

This network configuration ensures:

- Containers can communicate with each other by service name
- Improved security through network isolation
- Predictable and consistent network behavior

## Health Checks

Each service has health checks configured for improved reliability:

- **Postgres**: Checks if database is ready to accept connections
- **Backend**: Tests the `/api/health` endpoint
- **Frontend**: Tests the `/api/health` endpoint

These health checks ensure that containers start in the correct order and that dependent services wait until required services are fully operational.

## Troubleshooting

### Common Issues and Solutions

#### Backend container failing to start

If you see errors related to missing `libssl` libraries:

```
PrismaClientInitializationError: Unable to require libquery_engine-debian-openssl-1.1.x.so.node
```

This is already fixed in the docker-compose.yml by installing OpenSSL during container startup.

#### Database Connection Issues

If the backend cannot connect to the database:

1. Verify database container is running: `docker compose ps postgres`
2. Check database logs: `docker compose logs postgres`
3. Verify the DATABASE_URL environment variable in the .env file matches the PostgreSQL configuration:
   - Host should be `postgres` (the service name)
   - Port should be `5432` (the internal PostgreSQL port)
   - Username and password should match the ones in docker-compose.yml

#### Viewing Container Logs

```bash
# View logs for all containers
docker compose logs

# View logs for a specific service
docker compose logs backend
docker compose logs web
docker compose logs postgres

# Follow logs in real-time
docker compose logs -f
```

## Advanced Usage

### Rebuilding Containers

If you've made changes to the codebase, you'll need to rebuild the containers:

```bash
docker compose build
docker compose up -d
```

### Stopping Containers

```bash
# Stop but keep containers
docker compose stop

# Stop and remove containers
docker compose down

# Stop, remove containers, and delete volumes
docker compose down -v
```

### Database Management

To interact with the PostgreSQL database directly:

```bash
docker compose exec postgres psql -U myuser -d pictoraai
```

### Inspecting the Docker Network

To view network details and connected containers:

```bash
docker network inspect pictora-network
```

---

    environment:
      - POSTGRES_PASSWORD=mypassword
      - POSTGRES_USER=myuser
      - POSTGRES_DB=pictoraai
      - POSTGRES_HOST_AUTH_METHOD=trust
