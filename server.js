
// Express server with SQLite + Sequelize + JWT auth + menu + orders + admin
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Sequelize, DataTypes } = require("sequelize");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "supersecretkey";

// Database setup
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.sqlite"
});

// Models
const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING,
  isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
  canManageMenu: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const MenuItem = sequelize.define("MenuItem", {
  name: DataTypes.STRING,
  category: DataTypes.STRING,
  price: DataTypes.FLOAT,
  image: DataTypes.STRING
});

const Order = sequelize.define("Order", {
  items: DataTypes.TEXT, // JSON string
  status: { type: DataTypes.STRING, defaultValue: "pending" },
  userId: DataTypes.INTEGER
});

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Auth middleware
function auth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).send("Access denied");
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send("Invalid token");
    req.user = decoded;
    next();
  });
}

// Admin middleware
function admin(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).send("Admins only");
  next();
}

// Routes
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ username, password: hash });
    res.json(user);
  } catch {
    res.status(400).send("User already exists");
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user) return res.status(400).send("Invalid credentials");
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).send("Invalid credentials");
  const token = jwt.sign(
    { id: user.id, username: user.username, isAdmin: user.isAdmin, canManageMenu: user.canManageMenu },
    JWT_SECRET
  );
  res.json({ token });
});

// Menu routes
app.get("/api/menu", async (req, res) => {
  const items = await MenuItem.findAll();
  res.json(items);
});

app.post("/api/menu", auth, admin, upload.single("image"), async (req, res) => {
  if (!req.user.canManageMenu) return res.status(403).send("No menu permission");
  const { name, category, price } = req.body;
  const item = await MenuItem.create({ name, category, price, image: req.file ? "/uploads/" + req.file.filename : null });
  res.json(item);
});

app.put("/api/menu/:id", auth, admin, upload.single("image"), async (req, res) => {
  if (!req.user.canManageMenu) return res.status(403).send("No menu permission");
  const item = await MenuItem.findByPk(req.params.id);
  if (!item) return res.status(404).send("Not found");
  const { name, category, price } = req.body;
  item.name = name || item.name;
  item.category = category || item.category;
  item.price = price || item.price;
  if (req.file) item.image = "/uploads/" + req.file.filename;
  await item.save();
  res.json(item);
});

app.delete("/api/menu/:id", auth, admin, async (req, res) => {
  if (!req.user.canManageMenu) return res.status(403).send("No menu permission");
  const item = await MenuItem.findByPk(req.params.id);
  if (!item) return res.status(404).send("Not found");
  await item.destroy();
  res.send("Deleted");
});

// Orders
app.post("/api/orders", auth, async (req, res) => {
  const { items } = req.body;
  const order = await Order.create({ items: JSON.stringify(items), userId: req.user.id });
  res.json(order);
});

app.get("/api/orders", auth, admin, async (req, res) => {
  const orders = await Order.findAll();
  res.json(orders);
});

app.put("/api/orders/:id", auth, admin, async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order) return res.status(404).send("Not found");
  order.status = req.body.status || order.status;
  await order.save();
  res.json(order);
});

app.delete("/api/orders/:id", auth, admin, async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order) return res.status(404).send("Not found");
  await order.destroy();
  res.send("Deleted");
});

// Sync DB and seed admin + menu
sequelize.sync().then(async () => {
  const admin = await User.findOne({ where: { username: "kingyumyum" } });
  if (!admin) {
    const hash = await bcrypt.hash("Yumyumnevrfa1l", 10);
    await User.create({ username: "kingyumyum", password: hash, isAdmin: true, canManageMenu: true });
  }
  // Seed menu items if empty
  const count = await MenuItem.count();
  if (count === 0) {
    await MenuItem.bulkCreate([
      { name: "Lemonade", category: "Drinks", price: 2.0 },
      { name: "Strawberry Lemonade", category: "Drinks", price: 2.25 },
      { name: "Peach Lemonade", category: "Drinks", price: 2.5 },
      { name: "Water", category: "Drinks", price: 1.5 },
      { name: "Tropical Punch", category: "Drinks", price: 2.0 },
      { name: "Shrimp Fettuccine", category: "Mains", price: 17.85 },
      { name: "Chicken Fettuccine", category: "Mains", price: 16.85 },
      { name: "Mozzarella Basil Shrimp", category: "Mains", price: 16.5 },
      { name: "Tri Tip & Mac&Cheese", category: "Mains", price: 23.45 },
      { name: "Rib Eye Steak & Asparagus", category: "Mains", price: 25.35 },
      { name: "Fried Chicken Breast & Mac&Cheese", category: "Mains", price: 17.35 },
      { name: "French fries", category: "Sides", price: 7.85 },
      { name: "Mac&Cheese", category: "Sides", price: 9.85 },
      { name: "Salad", category: "Sides", price: 7.5 },
      { name: "Apple pie slice", category: "Sweets", price: 7 },
      { name: "Banana bread", category: "Sweets", price: 5 },
      { name: "Choco chip cookies", category: "Sweets", price: 3 },
      { name: "Snickerdoodle cookies", category: "Sweets", price: 3 },
      { name: "Double choc brownies", category: "Sweets", price: 5 },
      { name: "Lemon cupcakes", category: "Sweets", price: 4 },
      { name: "Vanilla cupcakes", category: "Sweets", price: 4 },
      { name: "Chocolate cupcakes", category: "Sweets", price: 4 },
      { name: "Cinnamon rolls", category: "Sweets", price: 5 }
    ]);
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
