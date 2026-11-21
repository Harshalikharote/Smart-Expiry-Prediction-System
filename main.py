from fastapi import FastAPI, HTTPException
import mysql.connector

app = FastAPI()

# MySQL Database Connection
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="55555",
    database="SmartExpiryDB"
)

cursor = db.cursor(dictionary=True)


@app.get("/")
def home():
    return {"message": "SmartExpiry API is running"}


@app.post("/login")
def login(email: str, password: str):

    query = """
        SELECT user_id, name, email, role
        FROM Users
        WHERE email = %s AND password = %s
    """

    cursor.execute(query, (email, password))
    user = cursor.fetchone()

    if user:
        return {
            "message": "Login successful",
            "user": user
        }

    raise HTTPException(
        status_code=401,
        detail="Invalid email or password"
    )