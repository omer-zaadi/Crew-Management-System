from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db_connection
from pydantic import BaseModel
from typing import List, Optional
import jwt
import datetime
import anthropic
import os
from dotenv import load_dotenv
from passlib.context import CryptContext #

# הצפנת סיסמאות
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

load_dotenv()

# הגדרות הצפנה ל-JWT
SECRET_KEY = os.getenv("SECRET_KEY", "fallback_key_for_dev_only")
ALGORITHM = "HS256"
security = HTTPBearer()

app = FastAPI(title="Crew Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# מודלים 
class LoginRequest(BaseModel):
    personal_id: str   # מספר אישי
    password: str

class EmployeeCreate(BaseModel):
    full_name: str
    personal_id: str   # מספר אישי — ייחודי לכל עובד
    password: str
    role: str = "employee"

class TaskCreate(BaseModel):
    description: str
    required_certification_ids: List[int] = []
    workers_needed: int = 1

class AssignRequest(BaseModel):
    task_id: int
    employee_id: int

class TaskStatusUpdate(BaseModel):
    status: str  # "in_progress" | "done"

#  JWT 
def create_token(employee_id: int, role: str) -> str:
    payload = {
        "sub": str(employee_id),  # PyJWT 2.x דורש string
        "role": role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_manager(payload=Depends(decode_token)):
    if payload.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager access required")
    return payload


# התחברות
@app.post("/login")
def login(body: LoginRequest):

    conn = get_db_connection() #
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed") #
    
    cursor = conn.cursor(dictionary=True) #
    
    try:
        cursor.execute(
            "SELECT id, full_name, role, password_hash FROM Employees WHERE personal_id = %s",
            (body.personal_id,)
        ) #
        
        employee = cursor.fetchone() #
        
        # בדיקת אימות סיסמה עם ה-Hash (וודא שייבאת את ה-pwd_context)
        if not employee or not pwd_context.verify(body.password, employee["password_hash"]):
            raise HTTPException(status_code=401, detail="מספר אישי או סיסמה שגויים") #

        token = create_token(employee["id"], employee["role"]) #
        return {
            "access_token": token,
            "token_type": "bearer",
            "employee_id": employee["id"],
            "full_name": employee["full_name"],
            "role": employee["role"]
        } #
        
    finally:
        cursor.close() #
        conn.close() #


# EMPLOYEES  
@app.post("/employees")
def create_employee(employee: EmployeeCreate, payload=Depends(require_manager)):
    conn = get_db_connection() #
    cursor = conn.cursor() #
    
    hashed_password = pwd_context.hash(employee.password)
    
    try:
        cursor.execute(
            "INSERT INTO Employees (full_name, personal_id, password_hash, role) VALUES (%s, %s, %s, %s)",
            (employee.full_name, employee.personal_id, hashed_password, employee.role) #
        )
        conn.commit() #
        return {"message": "Employee added successfully", "id": cursor.lastrowid} #
    except Exception as e:
        raise HTTPException(status_code=400, detail="מספר אישי כבר קיים במערכת") #
    finally:
        cursor.close() #
        conn.close() #

@app.delete("/employees/{employee_id}")
def delete_employee(employee_id: int, payload=Depends(require_manager)):
    """מנהל מוחק עובד מהמערכת"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # מניעת מחיקה עצמית
        if int(payload["sub"]) == employee_id:
            raise HTTPException(status_code=400, detail="לא ניתן למחוק את עצמך")
        # בדוק שהעובד לא משויך למשימה פעילה
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM Task_Assignments ta
            JOIN Tasks t ON ta.task_id = t.id
            WHERE ta.employee_id = %s AND t.status != 'done'
        """, (employee_id,))
        if cursor.fetchone()["cnt"] > 0:
            raise HTTPException(status_code=400, detail="לא ניתן למחוק עובד המשויך למשימה פעילה")
        cursor.execute("DELETE FROM Employees WHERE id = %s", (employee_id,))
        conn.commit()
        return {"message": "Employee deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/employees")
def get_employees(payload=Depends(decode_token)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            e.id, e.full_name, e.personal_id, e.role,
            GROUP_CONCAT(c.name SEPARATOR ', ') AS certifications
        FROM Employees e
        LEFT JOIN Employee_Certifications ec ON e.id = ec.employee_id
        LEFT JOIN Certifications c ON ec.certification_id = c.id
        GROUP BY e.id
    """)
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

@app.post("/employees/{employee_id}/certifications")
def add_certification_to_employee(employee_id: int, body: dict, payload=Depends(require_manager)):
    """body: {"certification_id": 3}"""
    cert_id = body.get("certification_id")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT IGNORE INTO Employee_Certifications (employee_id, certification_id) VALUES (%s, %s)",
            (employee_id, cert_id)
        )
        conn.commit()
        return {"message": "Certification added"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# CERTIFICATIONS
@app.get("/certifications")
def get_certifications(payload=Depends(decode_token)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM Certifications")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

@app.post("/certifications")
def create_certification(body: dict, payload=Depends(require_manager)):
    """body: {"name": "כיבוי אש"}"""
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO Certifications (name) VALUES (%s)", (name,))
        conn.commit()
        return {"message": "Certification created", "id": cursor.lastrowid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# TASKS
@app.get("/history")
def get_history(payload=Depends(decode_token)):
    """היסטוריית משימות שהושלמו + העובדים שביצעו אותן"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            t.id,
            t.description,
            t.workers_needed,
            t.created_at,
            GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') AS required_certifications,
            GROUP_CONCAT(DISTINCT e.full_name ORDER BY e.full_name SEPARATOR ', ') AS assigned_employees
        FROM Tasks t
        LEFT JOIN Task_Assignments ta ON t.id = ta.task_id
        LEFT JOIN Employees e ON ta.employee_id = e.id
        LEFT JOIN Task_Required_Certifications trc ON t.id = trc.task_id
        LEFT JOIN Certifications c ON trc.certification_id = c.id
        WHERE t.status = 'done'
        GROUP BY t.id
        ORDER BY t.id DESC
    """)
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

@app.get("/tasks")
def get_tasks(payload=Depends(decode_token)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            t.id,
            t.description,
            t.workers_needed,
            t.status,
            GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') AS required_certifications,
            COUNT(DISTINCT ta.employee_id)              AS assigned_count
        FROM Tasks t
        LEFT JOIN Task_Required_Certifications trc ON t.id = trc.task_id
        LEFT JOIN Certifications c ON trc.certification_id = c.id
        LEFT JOIN Task_Assignments ta ON t.id = ta.task_id
        GROUP BY t.id
    """)
    tasks = cursor.fetchall()
    cursor.close()
    conn.close()
    return tasks

@app.post("/tasks")
def create_task(task: TaskCreate, payload=Depends(require_manager)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO Tasks (description, workers_needed, status) VALUES (%s, %s, 'open')",
            (task.description, task.workers_needed)
        )
        new_task_id = cursor.lastrowid

        if task.required_certification_ids:
            certs_data = [(new_task_id, cid) for cid in task.required_certification_ids]
            cursor.executemany(
                "INSERT INTO Task_Required_Certifications (task_id, certification_id) VALUES (%s, %s)",
                certs_data
            )
        conn.commit()
        return {"message": "Task created successfully", "task_id": new_task_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, payload=Depends(require_manager)):
    """מנהל מוחק משימה (כולל שיוכים בגלל CASCADE)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM Tasks WHERE id = %s", (task_id,))
        conn.commit()
        return {"message": "Task deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.patch("/tasks/{task_id}/status")
def update_task_status(task_id: int, body: TaskStatusUpdate, payload=Depends(decode_token)):
    """עובד יכול לסמן סיום. מנהל יכול לשנות לכל סטטוס."""
    allowed = ["open", "in_progress", "done"]
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {allowed}")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE Tasks SET status=%s WHERE id=%s", (body.status, task_id))
        conn.commit()
        return {"message": "Status updated"}
    finally:
        cursor.close()
        conn.close()


# ASSIGNMENTS — שיוך עובדים למשימות
@app.get("/tasks/{task_id}/assignments")
def get_task_assignments(task_id: int, payload=Depends(decode_token)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT e.id, e.full_name, e.role
        FROM Task_Assignments ta
        JOIN Employees e ON ta.employee_id = e.id
        WHERE ta.task_id = %s
    """, (task_id,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

@app.get("/tasks/{task_id}/eligible-employees")
def get_eligible_employees(task_id: int, payload=Depends(require_manager)):
    """
    מחזיר עובדים ומנהלים שיש להם את כל ההסמכות הנדרשות למשימה,
    ושעדיין לא שויכו אליה.
    אם למשימה אין הסמכות נדרשות — מחזיר את כולם.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT e.id, e.full_name, e.personal_id, e.role,
               GROUP_CONCAT(c.name SEPARATOR ', ') AS certifications
        FROM Employees e
        LEFT JOIN Employee_Certifications ec ON e.id = ec.employee_id
        LEFT JOIN Certifications c ON ec.certification_id = c.id
        WHERE e.id NOT IN (
            SELECT employee_id FROM Task_Assignments WHERE task_id = %s
        )
        AND e.id NOT IN (
            -- מסנן עובדים שמשויכים כבר לכל משימה שלא הסתיימה
            SELECT ta.employee_id FROM Task_Assignments ta
            JOIN Tasks t ON ta.task_id = t.id
            WHERE t.status != 'done'
            AND ta.task_id != %s
        )
        AND (
            -- אם אין הסמכות נדרשות — כולם מתאימים
            (SELECT COUNT(*) FROM Task_Required_Certifications WHERE task_id = %s) = 0
            OR
            -- אחרת — רק מי שיש לו את כל ההסמכות
            (SELECT COUNT(*) FROM Task_Required_Certifications trc
             WHERE trc.task_id = %s
               AND trc.certification_id NOT IN (
                   SELECT certification_id FROM Employee_Certifications WHERE employee_id = e.id
               )
            ) = 0
        )
        GROUP BY e.id
        ORDER BY e.role DESC, e.full_name
    """, (task_id, task_id, task_id, task_id))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

@app.delete("/assignments/{task_id}/{employee_id}")
def remove_assignment(task_id: int, employee_id: int, payload=Depends(require_manager)):
    """מנהל מסיר עובד ממשימה"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM Task_Assignments WHERE task_id=%s AND employee_id=%s",
            (task_id, employee_id)
        )
        # אם אין יותר עובדים משויכים — החזר סטטוס ל-open
        cursor.execute(
            """UPDATE Tasks SET status='open' 
               WHERE id=%s AND status='in_progress'
               AND (SELECT COUNT(*) FROM Task_Assignments WHERE task_id=%s) = 0""",
            (task_id, task_id)
        )
        conn.commit()
        return {"message": "Assignment removed"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.post("/assignments")
def assign_employee(body: AssignRequest, payload=Depends(require_manager)):
    """מנהל משייך עובד למשימה"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT t.workers_needed,
                   COUNT(ta.employee_id) AS assigned_count
            FROM Tasks t
            LEFT JOIN Task_Assignments ta ON t.id = ta.task_id
            WHERE t.id = %s
            GROUP BY t.id
        """, (body.task_id,))
        task = cursor.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["assigned_count"] >= task["workers_needed"]:
            raise HTTPException(
                status_code=400,
                detail=f"המשימה כבר מלאה — נדרשים {task['workers_needed']} עובדים ויש {task['assigned_count']}"
            )

        cursor.execute("""
            SELECT COUNT(*) as cnt FROM Task_Assignments ta
            JOIN Tasks t ON ta.task_id = t.id
            WHERE ta.employee_id = %s AND t.status != 'done' AND ta.task_id != %s
        """, (body.employee_id, body.task_id))
        if cursor.fetchone()["cnt"] > 0:
            raise HTTPException(status_code=400, detail="העובד כבר משויך למשימה פעילה אחרת")

        cursor.execute(
            "INSERT IGNORE INTO Task_Assignments (task_id, employee_id) VALUES (%s, %s)",
            (body.task_id, body.employee_id)
        )
        cursor.execute(
            "UPDATE Tasks SET status='in_progress' WHERE id=%s AND status='open'",
            (body.task_id,)
        )
        conn.commit()
        return {"message": "Employee assigned successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.post("/tasks/{task_id}/self-assign")
def self_assign(task_id: int, payload=Depends(decode_token)):
    """עובד לוקח משימה פנויה לעצמו"""
    employee_id = int(payload["sub"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # בדוק שהמשימה פנויה
        cursor.execute("SELECT status, workers_needed FROM Tasks WHERE id=%s", (task_id,))
        task = cursor.fetchone()
        if not task or task["status"] == "done":
            raise HTTPException(status_code=400, detail="Task not available")

        cursor.execute("""
            SELECT COUNT(*) as missing
            FROM Task_Required_Certifications trc
            WHERE trc.task_id = %s
              AND trc.certification_id NOT IN (
                  SELECT certification_id FROM Employee_Certifications WHERE employee_id = %s
              )
        """, (task_id, employee_id))
        missing = cursor.fetchone()["missing"]
        if missing > 0:
            raise HTTPException(status_code=403, detail="You don't have the required certifications")

        cursor.execute(
            "INSERT IGNORE INTO Task_Assignments (task_id, employee_id) VALUES (%s, %s)",
            (task_id, employee_id)
        )
        cursor.execute(
            "UPDATE Tasks SET status='in_progress' WHERE id=%s AND status='open'",
            (task_id,)
        )
        conn.commit()
        return {"message": "Task assigned to you"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/my-tasks")
def get_my_tasks(payload=Depends(decode_token)):
    """המשימות של העובד המחובר"""
    employee_id = int(payload["sub"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT t.id, t.description, t.status, t.workers_needed,
               GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') AS required_certifications
        FROM Task_Assignments ta
        JOIN Tasks t ON ta.task_id = t.id
        LEFT JOIN Task_Required_Certifications trc ON t.id = trc.task_id
        LEFT JOIN Certifications c ON trc.certification_id = c.id
        WHERE ta.employee_id = %s
        GROUP BY t.id
    """, (employee_id,))
    tasks = cursor.fetchall()
    cursor.close()
    conn.close()
    return tasks


# המלצת עובד AI + ללא AI
@app.get("/tasks/{task_id}/recommend")
def recommend_employee(task_id: int, payload=Depends(require_manager)):
    """
    שולח ל-Claude AI את פרטי המשימה ורשימת עובדים מתאימים
    ומקבל המלצה מנומקת על העובד הכי מתאים.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT t.id, t.description, t.workers_needed,
               GROUP_CONCAT(c.name SEPARATOR ', ') AS required_certs
        FROM Tasks t
        LEFT JOIN Task_Required_Certifications trc ON t.id = trc.task_id
        LEFT JOIN Certifications c ON trc.certification_id = c.id
        WHERE t.id = %s
        GROUP BY t.id
    """, (task_id,))
    task = cursor.fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    cursor.execute("""
        SELECT e.id, e.full_name,
               GROUP_CONCAT(c.name SEPARATOR ', ') AS certifications,
               (SELECT COUNT(*) FROM Task_Assignments ta2 WHERE ta2.employee_id = e.id
                  AND ta2.task_id IN (SELECT id FROM Tasks WHERE status='in_progress')) AS active_tasks
        FROM Employees e
        LEFT JOIN Employee_Certifications ec ON e.id = ec.employee_id
        LEFT JOIN Certifications c ON ec.certification_id = c.id
        WHERE e.role = 'employee'
          AND e.id NOT IN (SELECT employee_id FROM Task_Assignments WHERE task_id = %s)
          AND (
              SELECT COUNT(*) FROM Task_Required_Certifications trc2
              WHERE trc2.task_id = %s
                AND trc2.certification_id NOT IN (
                    SELECT certification_id FROM Employee_Certifications WHERE employee_id = e.id
                )
          ) = 0
        GROUP BY e.id
    """, (task_id, task_id))
    candidates = cursor.fetchall()
    cursor.close()
    conn.close()

    if not candidates:
        return {"recommendation": "אין עובדים זמינים ומוסמכים למשימה זו כרגע."}

    candidates_text = "\n".join([
        f"- {c['full_name']} (הסמכות: {c['certifications'] or 'ללא'}, משימות פעילות: {c['active_tasks']})"
        for c in candidates
    ])

    prompt = f"""אתה מסייע למנהל לבחור את העובד המתאים ביותר למשימה.

משימה: {task['description']}
הסמכות נדרשות: {task['required_certs'] or 'ללא'}
מספר עובדים נדרש: {task['workers_needed']}

עובדים מועמדים (כולם עומדים בדרישות ההסמכה):
{candidates_text}

המלץ על העובד המתאים ביותר ונמק בקצרה (2-3 משפטים). 
העדף עובד עם פחות משימות פעילות ועם הסמכות רלוונטיות עודפות.
ענה בעברית בלבד."""

    try:
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        recommendation = message.content[0].text
    except Exception as e:
        # ללא המלצת AI
        best = min(candidates, key=lambda x: x["active_tasks"])
        recommendation = f"המלצה אוטומטית: {best['full_name']} — העובד עם הכי פחות משימות פעילות ({best['active_tasks']})."

    return {
        "task_id": task_id,
        "task_description": task["description"],
        "candidates": candidates,
        "recommendation": recommendation
    }