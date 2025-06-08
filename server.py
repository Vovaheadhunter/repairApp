from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor

app = FastAPI()

# Serve static and template files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Database configuration (PostgreSQL connection)
DB_CONFIG = {
    "dbname": "repair_app",
    "user": "root",
    "password": "SAWpzuoz8nZgQ2LaE1t2ysoE0n3yBPep",
    "host": "dpg-d12o8849c44c738he000-a.oregon-postgres.render.com",
    "port": 5432
}

def get_db():
    """Establish a connection to the PostgreSQL database."""
    try:
        conn = psycopg2.connect(
            dbname=DB_CONFIG["dbname"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            host=DB_CONFIG["host"],
            port=DB_CONFIG["port"]
        )
        return conn
    except Exception as e:
        raise Exception(f"Database connection error: {e}")

# Pydantic models
class ClientBase(BaseModel):
    name: str
    phone: str

class Client(ClientBase):
    id: int

    class Config:
        orm_mode = True

class ContractorBase(BaseModel):
    name: str
    specialization: str
    phone: str

class Contractor(ContractorBase):
    id: int

    class Config:
        orm_mode = True

class ObjectTypeBase(BaseModel):
    name: str
    cost_per_sqm: float

class ObjectType(ObjectTypeBase):
    id: int

    class Config:
        orm_mode = True

class ObjectBase(BaseModel):
    address: str
    object_type_id: int
    area: float

class Object(ObjectBase):
    id: int

    class Config:
        orm_mode = True

class MaterialBase(BaseModel):
    name: str
    cost_per_unit: float

class Material(MaterialBase):
    id: int

    class Config:
        orm_mode = True

class OrderMaterial(BaseModel):
    materials_id: int
    count: int

class OrderBase(BaseModel):
    client_id: int
    object_id: int
    contractor_id: int
    status: str
    materials: Dict[int, int]  # {materials_id: quantity}

class Order(OrderBase):
    id: int

    class Config:
        orm_mode = True

# Helper functions
def fetch_all(conn, query, model_class=None):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute(query)
    results = cursor.fetchall()
    cursor.close()
    if model_class:
        return [model_class(**row) for row in results]
    return results

def fetch_one(conn, query, params=()):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute(query, params)
    result = cursor.fetchone()
    cursor.close()
    return result

def execute_query(conn, query, params=()):
    cursor = conn.cursor()
    cursor.execute(query, params)
    conn.commit()
    cursor.close()

# Whitelist of safe entities for /api/{entity}
ALLOWED_ENTITIES = ["clients", "contractors", "object_types", "objects", "materials", "orders"]

@app.get("/api/objects")
def get_objects_with_type():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Use a JOIN to fetch objects with their type names
        query = """
            SELECT o.id, o.address, o.area, o.object_type_id, t.name AS type_name
            FROM objects o
            LEFT JOIN object_types t ON o.object_type_id = t.id
        """
        cursor.execute(query)
        results = cursor.fetchall()
        return results
    finally:
        cursor.close()
        conn.close()

@app.get("/api/orders")
def get_orders_with_names():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT 
                o.id AS order_id,
                o.client_id,
                c.name AS client_name,
                o.object_id,
                obj.address AS object_address,
                o.contractor_id,
                cont.name AS contractor_name,
                o.status,
                o.total_cost
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN objects obj ON o.object_id = obj.id
            LEFT JOIN contractors cont ON o.contractor_id = cont.id
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        orders = []
        for row in rows:
            # Fetch materials for this order
            cursor.execute("SELECT materials_id, count FROM materials_in_order WHERE order_id = %s", (row['order_id'],))
            materials = {}
            for mat_row in cursor.fetchall():
                materials[mat_row['materials_id']] = mat_row['count']
            # Build order with joined fields
            order = {
                "id": row['order_id'],
                "client_id": row['client_id'],
                "client_name": row['client_name'] or "Неизвестный клиент",
                "object_id": row['object_id'],
                "object_address": row['object_address'] or "Неизвестный объект",
                "contractor_id": row['contractor_id'],
                "contractor_name": row['contractor_name'] or "Неизвестный подрядчик",
                "status": row['status'],
                "materials": materials,
                "total_cost": row['total_cost']
            }
            orders.append(order)
        return orders
    finally:
        cursor.close()
        conn.close()

@app.get("/api/{entity}")
def get_entities(entity: str):
    if entity not in ALLOWED_ENTITIES:
        raise HTTPException(status_code=400, detail=f"Invalid entity: {entity}")
    conn = get_db()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(f"SELECT * FROM {entity}")
        results = cursor.fetchall()
        return results
    finally:
        conn.close()

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return {"message": "No favicon found"}

@app.get("/test-js")
def test_js():
    with open("static/app.js", "r") as f:
        return {"content": f.read()}

@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- Generic POST/PUT/DELETE for other entities ---
@app.post("/api/{entity}")
def create_entity(entity: str, request: dict):
    if entity not in ALLOWED_ENTITIES:
        raise HTTPException(status_code=400, detail=f"Invalid entity: {entity}")

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Remove 'id' from the request if it exists
        request.pop("id", None)

        # Special handling for orders
        materials = {}
        if entity == "orders":
            raw_materials = request.pop("materials", {})
            for k, v in raw_materials.items():
                try:
                    materials[int(k)] = int(v)
                except (ValueError, TypeError):
                    print(f"Ignoring invalid material entry: {k}:{v}")
                    continue

        columns = ", ".join(request.keys())
        values = list(request.values())
        query = f"INSERT INTO {entity} ({columns}) VALUES ({', '.join(['%s'] * len(values))}) RETURNING id"
        cursor.execute(query, values)
        item_id = cursor.fetchone()[0]
        conn.commit()

        # Handle materials only for orders
        if entity == "orders":
            conn2 = get_db()
            cursor2 = conn2.cursor()
            for material_id, count in materials.items():
                cursor2.execute(
                    "INSERT INTO materials_in_order (order_id, materials_id, count) VALUES (%s, %s, %s)",
                    (item_id, material_id, count)
                )
            conn2.commit()
            cursor2.close()
            conn2.close()

        return {"status": "created", "id": item_id}
    except Exception as e:
        print("Server error:", str(e))
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.put("/api/{entity}/{item_id}")
def update_item(entity: str, item_id: int, data: dict):
    if entity not in ALLOWED_ENTITIES:
        raise HTTPException(status_code=400, detail=f"Invalid entity: {entity}")
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Special handling for orders
        materials = None
        if entity == "orders":
            materials = data.pop("materials", None)
        updates = ', '.join([f"{k} = %s" for k in data.keys()])
        values = list(data.values()) + [item_id]
        cursor.execute(f"UPDATE {entity} SET {updates} WHERE id = %s", values)
        conn.commit()
        # Handle materials relationship table
        if entity == "orders" and materials is not None:
            # Delete old materials
            cursor.execute("DELETE FROM materials_in_order WHERE order_id = %s", (item_id,))
            # Insert updated ones
            for material_id, count in materials.items():
                cursor.execute(
                    "INSERT INTO materials_in_order (order_id, materials_id, count) VALUES (%s, %s, %s)",
                    (item_id, int(material_id), int(count))
                )
            conn.commit()
        return {"status": "updated"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/{entity}/{item_id}")
def delete_item(entity: str, item_id: int):
    if entity not in ALLOWED_ENTITIES:
        raise HTTPException(status_code=400, detail=f"Invalid entity: {entity}")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(f"DELETE FROM {entity} WHERE id = %s", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}