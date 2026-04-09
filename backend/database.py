import mysql.connector
from mysql.connector import Error
import os 
from dotenv import load_dotenv 

load_dotenv()

def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"), 
            port=int(os.getenv("DB_PORT", 3306)), 
            user=os.getenv("DB_USER", "root"), 
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME", "crew_managment_db") 
        )
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error while connecting to MySQL: {e}")
        return None
    
