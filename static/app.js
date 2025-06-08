let clients = [];
let contractors = [];
let objectTypes = [];
let objects = [];
let materials = [];
let orders = [];

// Load content based on entity
function loadContent(entity) {
    const apiUrls = {
        clients: "/api/clients",
        contractors: "/api/contractors",
        object_types: "/api/object_types",
        objects: "/api/objects",
        materials: "/api/materials",
        orders: "/api/orders"
    };

    Promise.all(
        Object.entries(apiUrls).map(([key, url]) =>
            fetch(url)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    // Assign data to correct variable
                    switch (key) {
                        case "clients": clients = Array.isArray(data) ? data : []; break;
                        case "contractors": contractors = Array.isArray(data) ? data : []; break;
                        case "object_types": objectTypes = Array.isArray(data) ? data : []; break;
                        case "objects": objects = Array.isArray(data) ? data : []; break;
                        case "materials": materials = Array.isArray(data) ? data : []; break;
                        case "orders": orders = Array.isArray(data) ? data : []; break;
                    }
                })
                .catch(err => {
                    console.error(`Error loading ${key}:`, err);
                })
        )
    ).then(() => {
        const container = document.getElementById("content");
        container.innerHTML = `<h2>${getDisplayName(entity)}</h2>`;
        renderTable(entity);
    }).catch(err => {
        console.error("Critical error loading data:", err);
        alert(`Не удалось загрузить данные для "${entity}"`);
    });
}

// Render table for non-order entities
function renderTable(entity) {
    const container = document.getElementById("content");

    // Map entity name to actual array
    const entityMap = {
        clients,
        contractors,
        object_types: objectTypes,
        objects,
        materials,
        orders
    };
    const data = entityMap[entity] || [];

    const table = document.createElement("table");
    table.border = "1";
    table.style.width = "100%";

    const skipColumns = ["client_id", "object_type_id", "object_id", "contractor_id", "materials"];

    // Generate headers from first item's keys
    if (data.length > 0) {
        const headers = Object.keys(data[0]).filter(k => !skipColumns.includes(k));
        table.innerHTML = "<tr>" +
            headers.map(h => `<th>${formatHeader(h)}</th>`).join("") +
            "<th>Действия</th></tr>";
    }

    const tbody = document.createElement("tbody");

    data.forEach(row => {
        const tr = document.createElement("tr");

        Object.entries(row).forEach(([key, val]) => {
            const td = document.createElement("td");

            if (skipColumns.includes(key)) {
                return; // Skip ID columns
            }

            // Format values for display
            if (typeof val === "object" && val !== null) {
                td.textContent = JSON.stringify(val);
            } else if (val === null || val === undefined) {
                td.textContent = "";
            } else {
                td.textContent = val;
            }

            tr.appendChild(td);
        });

        // Add actions
        const actionsTd = document.createElement("td");
        const editBtn = document.createElement("button");
        editBtn.textContent = entity === "orders" ? "Редактировать заказ" : "Редактировать";
        if (entity === "orders") {
            editBtn.onclick = () => openEditOrderModal(entity, row);
        } else {
            editBtn.onclick = () => openEditModal(entity, row);
        }

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Удалить";
        deleteBtn.style.marginLeft = "5px";
        deleteBtn.onclick = () => deleteEntity(entity, row.id);

        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(deleteBtn);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    // Add "Add" button
    const addBtn = document.createElement("button");
    addBtn.textContent = entity === "orders" ? "Добавить заказ" : "Добавить запись";
    if (entity === "orders") {
        addBtn.onclick = () => openAddOrderModal(entity);
    } else {
        addBtn.onclick = () => openAddModal(entity);
    }
    container.appendChild(addBtn);
}

// Open modal to add a new order
function openAddOrderModal(entity) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";

    // Build form HTML for basic order info
    let formHtml = `
        <label>Клиент:
            <select name="client_id" required>
                ${clients.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
            </select>
        </label><br>

        <label>Объект:
            <select name="object_id" required>
                ${objects.map(o => `<option value="${o.id}">${o.address}</option>`).join("")}
            </select>
        </label><br>

        <label>Подрядчик:
            <select name="contractor_id" required>
                ${contractors.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
            </select>
        </label><br>

        <label>Статус:
            <select name="status" required>
                <option value="Новый">Новый</option>
                <option value="В работе">В работе</option>
                <option value="Завершен">Завершен</option>
            </select>
        </label><br>

        <h4>Материалы:</h4>
        <div id="materials-container">
            <!-- Material rows will be added here -->
        </div>
        <button type="button" onclick="addMaterialRow()">Добавить материал</button>
        <br><br>
    `;

    modal.innerHTML = `
        <div class="modal-content" style="width: 800px;">
            <span onclick="this.parentNode.parentNode.remove()">&times;</span>
            <h3>Добавить заказ</h3>
            <form id="${entity}-add-form">${formHtml}<button type="submit">Сохранить заказ</button></form>
        </div>
    `;

    document.body.appendChild(modal);

    // Add one empty material row by default
    addMaterialRow();

    // Handle form submission
    document.getElementById(`${entity}-add-form`).onsubmit = function (e) {
        e.preventDefault();

        const form = this;
        const formData = new FormData(form);

        // Build base payload excluding materials_id and count
        const payload = {};
        for (const [key, value] of formData.entries()) {
            if (key === "materials_id" || key === "count") continue;
            payload[key] = value;
        }

        // Extract material rows
        const materials = {};
        document.querySelectorAll(".material-row").forEach(row => {
            const matIdInput = row.querySelector("[name='materials_id']");
            const countInput = row.querySelector("[name='count']");

            if (!matIdInput || !countInput) return;

            const matId = matIdInput.value.trim();
            const count = parseInt(countInput.value);

            if (matId && count > 0) {
                materials[matId] = count;
            }
        });

        payload.materials = materials;

        // Debugging
        console.log("Final Payload:", payload);

        fetch(`/api/${entity}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) throw new Error("Ошибка сети");
            return res.json();
        })
        .then(() => {
            alert("Заказ добавлен");
            document.body.removeChild(modal);
            loadContent(entity);
        })
        .catch(err => {
            alert("Ошибка при сохранении: " + err.message);
        });
    };
}

// Open modal to edit an existing order
function openEditOrderModal(entity, item) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";

    let formHtml = `
        <input type="hidden" name="id" value="${item.id}">
        
        <label>Клиент:
            <select name="client_id" disabled>
                ${clients.map(c => `<option value="${c.id}" ${c.id === item.client_id ? "selected" : ""}>${c.name}</option>`).join("")}
            </select>
        </label><br>
        
        <label>Объект:
            <select name="object_id" disabled>
                ${objects.map(o => `<option value="${o.id}" ${o.id === item.object_id ? "selected" : ""}>${o.address}</option>`).join("")}
            </select>
        </label><br>
        
        <label>Подрядчик:
            <select name="contractor_id" required>
                ${contractors.map(c => `<option value="${c.id}" ${c.id === item.contractor_id ? "selected" : ""}>${c.name}</option>`).join("")}
            </select>
        </label><br>
        
        <label>Статус:
            <select name="status" required>
                <option value="Новый" ${item.status === "Новый" ? "selected" : ""}>Новый</option>
                <option value="В работе" ${item.status === "В работе" ? "selected" : ""}>В работе</option>
                <option value="Завершен" ${item.status === "Завершен" ? "selected" : ""}>Завершен</option>
            </select>
        </label><br>
        
        <h4>Материалы:</h4>
        <div id="materials-container"></div>
        <button type="button" onclick="addMaterialRow()">Добавить материал</button>
        <br><br>
    `;

    modal.innerHTML = `
        <div class="modal-content" style="width: 800px;">
            <span onclick="this.parentNode.parentNode.remove()">&times;</span>
            <h3>Редактировать заказ</h3>
            <form id="${entity}-edit-form">${formHtml}<button type="submit">Сохранить изменения</button></form>
        </div>
    `;

    document.body.appendChild(modal);

    const container = document.getElementById("materials-container");

    // Parse materials safely
    let materials = {};
    try {
        materials = typeof item.materials === 'string'
            ? JSON.parse(item.materials)
            : item.materials || {};
    } catch (e) {
        console.error("Failed to parse materials:", e);
        materials = {};
    }

    // Populate existing materials
    if (materials && typeof materials === "object") {
        Object.entries(materials).forEach(([matId, count]) => {
            const row = createMaterialRow(parseInt(matId), count);
            container.appendChild(row);
        });
    }

    if (document.querySelectorAll(".material-row").length === 0) {
        addMaterialRow(); // Add one empty row if none exist
    }

    // Handle form submission
    document.getElementById(`${entity}-edit-form`).onsubmit = function (e) {
        try {
            e.preventDefault();

            const form = this;
            const formData = new FormData(form);

            // Log raw data for debugging
            const rawFormData = Object.fromEntries(formData);
            console.log("Raw FormData:", rawFormData);

            // Build base payload excluding material_id and count
            const payload = {};
            for (const [key, value] of formData.entries()) {
                if (key === "materials_id" || key === "count") continue;
                payload[key] = value;
            }

            // Extract material rows
            const materials = {};
            document.querySelectorAll(".material-row").forEach(row => {
                const matIdInput = row.querySelector("[name='materials_id']");
                const countInput = row.querySelector("[name='count']");

                if (!matIdInput || !countInput) return;

                const matId = matIdInput.value.trim();
                const count = parseInt(countInput.value);

                if (matId && count > 0) {
                    materials[matId] = count;
                }
            });

            payload.materials = materials;

            // Final debug log
            console.log("Final Payload:", payload);

            // Send to API
            fetch(`/api/${entity}/${item.id || ''}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
            .then(res => {
                if (!res.ok) throw new Error("Network error");
                return res.json();
            })
            .then(() => {
                alert("Заказ обновлен");
                document.body.removeChild(modal);
                loadContent(entity);
            })
            .catch(err => {
                alert("Ошибка при сохранении: " + err.message);
            });

        } catch (err) {
            console.error("Form submit error:", err);
            alert("Произошла ошибка: " + err.message);
        }
    };
}

// Create a new material row
function createMaterialRow(materialId = "", quantity = "1") {
    const row = document.createElement("div");
    row.className = "material-row";
    row.style.marginBottom = "10px";

    const select = document.createElement("select");
    select.name = "materials_id";
    select.required = true;

    materials.forEach(mat => {
        const option = document.createElement("option");
        option.value = mat.id;
        option.textContent = `${mat.name} (${mat.cost_per_unit} руб/ед)`;
        if (mat.id === materialId) option.selected = true;
        select.appendChild(option);
    });

    const input = document.createElement("input");
    input.type = "number";
    input.name = "count";
    input.min = "0";
    input.value = quantity || 1;
    input.required = true;
    input.style.width = "60px";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Удалить";
    removeBtn.style.marginLeft = "5px";
    removeBtn.onclick = () => {
        row.remove();
    };

    row.appendChild(select);
    row.appendChild(document.createTextNode(" Количество: "));
    row.appendChild(input);
    row.appendChild(removeBtn);

    return row;
}

// Add a new material row to the form
function addMaterialRow() {
    const container = document.getElementById("materials-container");
    const row = createMaterialRow();
    container.appendChild(row);
}



// Delete any entity
function deleteEntity(entity, id) {
    if (!confirm(`Удалить запись ${entity} с ID ${id}?`)) return;
    fetch(`/api/${entity}/${id}`, {
        method: "DELETE"
    }).then(() => loadContent(entity));
}

// Open modal to add new entity
function openAddModal(entity) {
    const fields = getFields(entity);
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";
    let formHtml = "";
    for (const [key, type] of Object.entries(fields)) {
        formHtml += `<label>${formatHeader(key)}: ${generateInput(key, type)}</label><br>`;
    }
    modal.innerHTML = `
        <div class="modal-content">
            <span onclick="this.parentNode.parentNode.remove()">&times;</span>
            <h3>Добавить ${getDisplayName(entity)}</h3>
            <form id="${entity}-add-form">${formHtml}<button type="submit">Сохранить</button></form>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById(`${entity}-add-form`).onsubmit = function(e) {
    e.preventDefault();
    const formData = new FormData(this);
    const payload = {};
    for (const [key, value] of formData.entries()) {
        if (key === "id") continue; // Exclude the 'id' field
        payload[key] = value;
    }
    fetch(`/api/${entity}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(() => {
        alert("Запись добавлена");
        document.body.removeChild(modal);
        loadContent(entity);
    }).catch(err => {
        alert("Ошибка при сохранении: " + err);
    });
};
}

// Open modal to edit entity
function openEditModal(entity, item) {
    const fields = getFields(entity);
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";
    let formHtml = "";
    for (const key in fields) {
        const value = item[key];
        formHtml += `<label>${formatHeader(key)}: ${generateInput(key, fields[key], value)}</label><br>`;
    }
    modal.innerHTML = `
        <div class="modal-content">
            <span onclick="this.parentNode.parentNode.remove()">&times;</span>
            <h3>Редактировать ${getDisplayName(entity)}</h3>
            <form id="${entity}-edit-form">${formHtml}<button type="submit">Сохранить изменения</button></form>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById(`${entity}-edit-form`).onsubmit = function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const payload = Object.fromEntries(formData);
        fetch(`/api/${entity}/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).then(() => {
            alert("Запись обновлена");
            document.body.removeChild(modal);
            loadContent(entity);
        }).catch(err => {
            alert("Ошибка при обновлении: " + err);
        });
    };
}

// Get field definitions per entity
function getFields(entity) {
    switch (entity) {
        case "clients":
            return { name: "text", phone: "text" };
        case "contractors":
            return { name: "text", specialization: "text", phone: "text" };
        case "object_types":
            return { name: "text", cost_per_sqm: "number" };
        case "objects":
            return { address: "text", object_type_id: "select", area: "number" };
        case "materials":
            return { name: "text", cost_per_unit: "number" };
        default:
            return {};
    }
}

// Generate input field
// Generate input field
function generateInput(name, type, value = "") {
    if (type === "select") {
        const entityMap = {
            object_type_id: "object_types",
            client_id: "clients",
            contractor_id: "contractors"
        };
        const listName = entityMap[name] || name.replace("_id", "s");
        const options = window[listName] || [];

        // Debugging
        if (!options || !Array.isArray(options)) {
            console.error(`Invalid data for ${listName}`, options);
            return `<select name="${name}"><option>Ошибка загрузки данных</option></select>`;
        }

        return `<select name="${name}" required>
            ${options.map(item => {
                const label = item.name || item.address || item.specialization || "Без имени";
                return `<option value="${item.id}" ${item.id === value ? "selected" : ""}>${label}</option>`;
            }).join("")}
        </select>`;
    } else {
        return `<input type="${type}" name="${name}" value="${value}" required>`;
    }
}

// Format header names
function formatHeader(str) {
    return str.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Get display name for entities
function getDisplayName(entity) {
    const names = {
        clients: "Клиенты",
        contractors: "Подрядчики",
        object_types: "Типы Объектов",
        objects: "Объекты",
        materials: "Материалы",
        orders: "Заказы"
    };
    return names[entity] || entity;
}