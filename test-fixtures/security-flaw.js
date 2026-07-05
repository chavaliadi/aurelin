// Test fixture containing intentional security flaws to verify static analysis gates

// 1. Eval usage
function processInput(userInput) {
    const parsed = eval("(" + userInput + ")");
    return parsed;
}

// 2. Exposed secrets
const API_KEY = "fake-1234567890-abcdefghijklmnop";
const jwt_secret = "my-super-secret-key-12345!";

// 3. SQL injection vulnerability
function getUser(userId) {
    const query = `SELECT * FROM users WHERE id = ${userId}`;
    db.execute(query);
}

module.exports = { processInput, getUser };
