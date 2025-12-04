from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class UserStats(BaseModel):
    total_users: int
    active_users: int

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/stats/users")
def get_user_stats():
    return {"total_users": 100, "active_users": 42}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
