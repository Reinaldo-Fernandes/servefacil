import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
let app;
let db;
let auth;
let userId = 'anonymous'; // Default to anonymous
let isAuthReady = false; // Flag to ensure auth is ready before Firestore ops

// Application state
let tables = [];
let selectedTableId = null;
let currentOrderItems = []; // Items currently selected from the menu for the active table

// Sample Menu Data
const menu = [
    { id: 'item1', name: 'Pizza Margherita', price: 45.00 },
    { id: 'item2', name: 'Lasanha à Bolonhesa', price: 38.50 },
    { id: 'item3', name: 'Salmão Grelhado', price: 62.00 },
    { id: 'item4', name: 'Risoto de Cogumelos', price: 42.00 },
    { id: 'item5', name: 'Refrigerante', price: 7.00 },
    { id: 'item6', name: 'Água Mineral', price: 5.00 },
    { id: 'item7', name: 'Cerveja Artesanal', price: 22.00 },
    { id: 'item8', name: 'Pudim de Leite', price: 15.00 },
    { id: 'item9', name: 'Brownie com Sorvete', price: 18.00 },
    { id: 'item10', name: 'Café Expresso', price: 8.00 },
    { id: 'item11', name: 'Suco Natural', price: 10.00 },
    { id: 'item12', name: 'Batata Frita', price: 20.00 },
    { id: 'item13', name: 'Porção de Picanha', price: 90.00 },
    { id: 'item14', name: 'Caldo Verde', price: 25.00 },
    { id: 'item15', name: 'Espetinho de Frango', price: 12.00 }
];

// DOM Elements
const tablesContainer = document.getElementById('tables-container');
const menuList = document.getElementById('menu-list');
const orderList = document.getElementById('order-list');
const orderTotalSpan = document.getElementById('order-total');
const currentTableIdSpan = document.getElementById('current-table-id');
const addToOrderBtn = document.getElementById('add-to-order-btn');
const clearOrderBtn = document.getElementById('clear-order-btn');
const checkoutBtn = document.getElementById('checkout-btn');
const userIdDisplay = document.getElementById('userIdDisplay');
const messageBox = document.getElementById('message-box');

// Confirmation Modal Elements
const confirmationModal = document.getElementById('confirmation-modal');
const confirmationMessage = document.getElementById('confirmation-message');
const confirmYesBtn = document.getElementById('confirm-yes');
const confirmNoBtn = document.getElementById('confirm-no');
let confirmCallback = null; // Callback function for confirmation

/**
 * Displays a message box with a given message and type (success or error).
 * @param {string} message - The message to display.
 * @param {'success' | 'error'} type - The type of message (determines styling).
 */
function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `message-box show ${type}`;
    setTimeout(() => {
        messageBox.className = 'message-box'; // Hide after animation
    }, 3000); // Matches animation duration
}

/**
 * Shows a custom confirmation modal.
 * @param {string} message - The message to display in the modal.
 * @param {function} onConfirm - The callback function to execute if 'Yes' is clicked.
 */
function showConfirmation(message, onConfirm) {
    confirmationMessage.textContent = message;
    confirmationModal.classList.remove('hidden');
    confirmCallback = onConfirm;
}

/**
 * Hides the custom confirmation modal.
 */
function hideConfirmation() {
    confirmationModal.classList.add('hidden');
    confirmCallback = null;
}

// Event listeners for confirmation modal buttons
confirmYesBtn.addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback(true);
    }
    hideConfirmation();
});

confirmNoBtn.addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback(false);
    }
    hideConfirmation();
});


/**
 * Initializes Firebase and sets up authentication.
 */
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                isAuthReady = true;
                console.log('Usuário autenticado:', userId);
                setupFirestoreListeners(); // Setup listeners after auth is ready
            } else {
                // Sign in anonymously if no user is found and no custom token is provided
                if (!initialAuthToken) {
                    await signInAnonymously(auth);
                    console.log('Autenticado anonimamente.');
                }
            }
        });

        // Sign in with custom token if available
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log('Autenticado com token personalizado.');
        }
    } catch (error) {
        console.error("Erro ao inicializar Firebase ou autenticar:", error);
        showMessage("Erro ao iniciar o aplicativo. Tente novamente.", "error");
    }
}

/**
 * Sets up real-time listeners for tables data from Firestore.
 */
function setupFirestoreListeners() {
    if (!db || !isAuthReady) {
        console.warn("Firestore ou autenticação não estão prontos para configurar listeners.");
        return;
    }

    const tablesCollectionRef = collection(db, `artifacts/${appId}/public/data/tables`);

    onSnapshot(tablesCollectionRef, (snapshot) => {
        tables = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTables();
        // If a table is currently selected, refresh its order display
        if (selectedTableId) {
            const currentTable = tables.find(t => t.id === selectedTableId);
            if (currentTable) {
                currentOrderItems = currentTable.order || [];
                renderOrder();
            }
        }
        console.log("Dados das mesas atualizados:", tables);
    }, (error) => {
        console.error("Erro ao obter dados das mesas em tempo real:", error);
        showMessage("Erro ao carregar dados das mesas.", "error");
    });
}

/**
 * Renders the list of tables in the UI.
 */
function renderTables() {
    tablesContainer.innerHTML = '';
    // Ensure tables are sorted numerically for better display
    const sortedTables = [...tables].sort((a, b) => parseInt(a.id.replace('mesa-', '')) - parseInt(b.id.replace('mesa-', '')));

    sortedTables.forEach(table => {
        const tableCard = document.createElement('div');
        tableCard.className = `col-12 mb-3 table-card card text-center p-0 ${table.status === 'occupied' ? 'occupied' : 'available'} ${selectedTableId === table.id ? 'active' : ''}`;
        // Add a data attribute for easy selection
        tableCard.setAttribute('data-table-id', table.id);
        tableCard.innerHTML = `
            <div class="card-header text-xl font-bold py-2 rounded-t-xl">Mesa ${table.id.replace('mesa-', '')}</div>
            <div class="card-body p-3">
                <p class="card-text text-lg mb-1">Status: <span class="font-semibold">${table.status === 'occupied' ? 'Ocupada' : 'Disponível'}</span></p>
                <p class="card-text text-md text-gray-700">Total: R$ ${calculateOrderTotal(table.order || []).toFixed(2)}</p>
            </div>
        `;
        tableCard.addEventListener('click', () => selectTable(table.id));
        tablesContainer.appendChild(tableCard);
    });
}

/**
 * Renders the menu items in the UI.
 */
function renderMenu() {
    menuList.innerHTML = '';
    menu.forEach(item => {
        const menuItemDiv = document.createElement('div');
        menuItemDiv.className = 'menu-item';
        menuItemDiv.innerHTML = `
            <span class="text-lg font-medium">${item.name}</span>
            <span class="text-lg font-semibold">R$ ${item.price.toFixed(2)}</span>
            <button class="btn btn-sm btn-outline-primary add-item-to-current-order" data-item-id="${item.id}" ${!selectedTableId ? 'disabled' : ''}>Adicionar</button>
        `;
        menuList.appendChild(menuItemDiv);
    });

    // Add event listeners to "Add" buttons in the menu
    document.querySelectorAll('.add-item-to-current-order').forEach(button => {
        button.addEventListener('click', (e) => {
            const itemId = e.target.dataset.itemId;
            addItemToCurrentOrder(itemId);
        });
    });
}

/**
 * Calculates the total price of an order.
 * @param {Array} order - The array of order items.
 * @returns {number} The total price.
 */
function calculateOrderTotal(order) {
    return order.reduce((total, item) => total + (item.price * item.quantity), 0);
}

/**
 * Renders the current order for the selected table in the UI.
 */
function renderOrder() {
    orderList.innerHTML = '';
    let total = 0;

    if (currentOrderItems.length === 0) {
        orderList.innerHTML = '<li class="text-center text-gray-500">Nenhum item no pedido.</li>';
    } else {
        currentOrderItems.forEach(item => {
            const listItem = document.createElement('li');
            listItem.className = 'order-list-item';
            listItem.innerHTML = `
                <span>${item.name} (x${item.quantity})</span>
                <span>R$ ${(item.price * item.quantity).toFixed(2)}</span>
                <div>
                    <button class="btn btn-sm btn-outline-secondary me-1 remove-one-item" data-item-id="${item.id}">-</button>
                    <button class="btn btn-sm btn-outline-danger remove-all-item" data-item-id="${item.id}">X</button>
                </div>
            `;
            orderList.appendChild(listItem);
        });

        // Add event listeners for removing items
        document.querySelectorAll('.remove-one-item').forEach(button => {
            button.addEventListener('click', (e) => {
                const itemId = e.target.dataset.itemId;
                removeItemFromCurrentOrder(itemId, 1);
            });
        });
        document.querySelectorAll('.remove-all-item').forEach(button => {
            button.addEventListener('click', (e) => {
                const itemId = e.target.dataset.itemId;
                removeItemFromCurrentOrder(itemId, 'all');
            });
        });
    }

    total = calculateOrderTotal(currentOrderItems);
    orderTotalSpan.textContent = total.toFixed(2);

    // Enable/disable buttons based on selected table and order content
    const hasSelectedTable = selectedTableId !== null;
    const hasOrderItems = currentOrderItems.length > 0;

    addToOrderBtn.disabled = !hasSelectedTable;
    clearOrderBtn.disabled = !hasSelectedTable || !hasOrderItems;
    checkoutBtn.disabled = !hasSelectedTable || !hasOrderItems;

    // Update menu item buttons
    document.querySelectorAll('.add-item-to-current-order').forEach(button => {
        button.disabled = !hasSelectedTable;
    });
}

/**
 * Selects a table and updates the UI.
 * @param {string} id - The ID of the table to select.
 */
function selectTable(id) {
    selectedTableId = id;
    currentTableIdSpan.textContent = id.replace('mesa-', '');

    // Load the order for the selected table
    const table = tables.find(t => t.id === selectedTableId);
    currentOrderItems = table ? (table.order || []) : [];
    renderOrder();
    renderTables(); // Re-render tables to update active state
}

/**
 * Adds an item to the current order.
 * @param {string} itemId - The ID of the item to add.
 */
function addItemToCurrentOrder(itemId) {
    const menuItem = menu.find(item => item.id === itemId);
    if (!menuItem) return;

    const existingItemIndex = currentOrderItems.findIndex(item => item.id === itemId);

    if (existingItemIndex > -1) {
        currentOrderItems[existingItemIndex].quantity++;
    } else {
        currentOrderItems.push({ ...menuItem, quantity: 1 });
    }
    renderOrder();
}

/**
 * Removes an item from the current order.
 * @param {string} itemId - The ID of the item to remove.
 * @param {number|'all'} quantityToRemove - The quantity to remove, or 'all' to remove all.
 */
function removeItemFromCurrentOrder(itemId, quantityToRemove) {
    const existingItemIndex = currentOrderItems.findIndex(item => item.id === itemId);

    if (existingItemIndex > -1) {
        if (quantityToRemove === 'all' || currentOrderItems[existingItemIndex].quantity <= quantityToRemove) {
            currentOrderItems.splice(existingItemIndex, 1);
        } else {
            currentOrderItems[existingItemIndex].quantity -= quantityToRemove;
        }
    }
    renderOrder();
}

/**
 * Saves the current order to the selected table in Firestore.
 */
async function saveOrderToTable() {
    if (!selectedTableId || !db || !isAuthReady) {
        showMessage("Selecione uma mesa e aguarde a inicialização.", "error");
        return;
    }

    const tableRef = doc(db, `artifacts/${appId}/public/data/tables`, selectedTableId);
    const tableStatus = currentOrderItems.length > 0 ? 'occupied' : 'available';

    try {
        await setDoc(tableRef, {
            id: selectedTableId,
            order: currentOrderItems,
            status: tableStatus
        }, { merge: true }); // Merge to update existing fields without overwriting others
        showMessage("Pedido salvo com sucesso!", "success");
    } catch (error) {
        console.error("Erro ao salvar pedido:", error);
        showMessage("Erro ao salvar pedido. Tente novamente.", "error");
    }
}

/**
 * Clears the order for the selected table in Firestore.
 */
async function clearOrderForTable() {
    if (!selectedTableId || !db || !isAuthReady) {
        showMessage("Selecione uma mesa e aguarde a inicialização.", "error");
        return;
    }

    const tableRef = doc(db, `artifacts/${appId}/public/data/tables`, selectedTableId);

    try {
        await setDoc(tableRef, {
            id: selectedTableId,
            order: [],
            status: 'available'
        }, { merge: true });
        currentOrderItems = [];
        renderOrder();
        showMessage("Pedido limpo e mesa liberada!", "success");
    } catch (error) {
        console.error("Erro ao limpar pedido:", error);
        showMessage("Erro ao limpar pedido. Tente novamente.", "error");
    }
}

/**
 * Handles the checkout process for the selected table.
 */
async function checkoutTable() {
    if (!selectedTableId || !db || !isAuthReady) {
        showMessage("Selecione uma mesa e aguarde a inicialização.", "error");
        return;
    }

    const currentTable = tables.find(t => t.id === selectedTableId);
    if (!currentTable || currentTable.order.length === 0) {
        showMessage("Não há pedido para fechar nesta mesa.", "error");
        return;
    }

    const total = calculateOrderTotal(currentTable.order);
    showConfirmation(`Confirmar fechamento da conta para Mesa ${selectedTableId.replace('mesa-', '')}? Total: R$ ${total.toFixed(2)}`, async (confirmed) => {
        if (confirmed) {
            // In a real app, you'd process payment here.
            // For this example, we just clear the order and make the table available.
            await clearOrderForTable();
            showMessage(`Conta da Mesa ${selectedTableId.replace('mesa-', '')} fechada. Total: R$ ${total.toFixed(2)}.`, "success");
        }
    });
}

/**
 * Initializes a set number of tables in Firestore if they don't exist.
 * This is for initial setup.
 */
async function initializeTablesIfEmpty() {
    if (!db || !isAuthReady) {
        console.warn("Firestore ou autenticação não estão prontos para inicializar mesas.");
        return;
    }

    const tablesCollectionRef = collection(db, `artifacts/${appId}/public/data/tables`);
    const snapshot = await getDocs(tablesCollectionRef);

    if (snapshot.empty) {
        console.log("Nenhuma mesa encontrada. Inicializando mesas...");
        const numTables = 10; // You can change this
        for (let i = 1; i <= numTables; i++) {
            const tableId = `mesa-${i}`;
            const tableRef = doc(db, `artifacts/${appId}/public/data/tables`, tableId);
            await setDoc(tableRef, {
                id: tableId,
                order: [],
                status: 'available'
            });
        }
        showMessage(`${numTables} mesas inicializadas!`, "success");
    }
}

// Event Listeners
addToOrderBtn.addEventListener('click', saveOrderToTable);
clearOrderBtn.addEventListener('click', () => {
    showConfirmation('Tem certeza que deseja limpar o pedido desta mesa?', (confirmed) => {
        if (confirmed) {
            clearOrderForTable();
        }
    });
});
checkoutBtn.addEventListener('click', checkoutTable);

// Initial render calls
window.onload = async function() {
    await initializeFirebase(); // Initialize Firebase first
    // Wait for auth to be ready before calling Firestore operations that require it
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
            unsubscribeAuth(); // Stop listening once authenticated
            await initializeTablesIfEmpty(); // Initialize tables only after auth and if empty
            renderMenu(); // Render menu once
            renderOrder(); // Render initial empty order
        }
    });
};
