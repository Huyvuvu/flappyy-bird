# Docker Setup

To run the Flappy Bird project using Docker:

1.  Make sure you have Docker installed (you have version 27.4.0).
2.  Run the following command in the root of the project:

    ```powershell
    docker compose up --build
    ```

3.  Access the application:
    - **Frontend**: http://localhost
    - **Backend API**: http://localhost:3001
    - **Swagger Docs**: http://localhost:3001/api-docs

## Configuration

- The backend runs on port `3001`.
- The frontend runs on port `80`.
- Environment variables are loaded from `backend/.env` for the backend.
