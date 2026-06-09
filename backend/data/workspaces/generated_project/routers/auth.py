```python
from fastapi import APIRouter, Depends, HTTPException
from models.user import User
from security.jwt_authentication import get_current_user, authenticate_user, create_access_token

router = APIRouter()

@router.post("/register")
async def register(user: User):
    return {"message": "User registered", "user": user}

@router.get("/protected")
async def protected_route(current_user: User = Depends(get_current_user)):
    return {"message": "Access granted", "user": current_user}

@router.post("/login")
async def login(username: str, password: str):
    user = authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}
```