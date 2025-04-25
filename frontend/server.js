const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8386;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Connection
const uri = "mongodb+srv://ziadm8445:1234@cluster0.gicfr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  points: { type: Number, default: 0 }, // نقاط الطالب
  total: { type: Number, default: 0 },  // الإجمالي
  details: [{
    exam: String,
    points: Number,
    total: Number,
  }],
});

const User = mongoose.model('User', userSchema);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ points: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single user
app.get('/api/users/:name', async (req, res) => {
  try {
    const user = await User.findOne({ name: req.params.name });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create user (يحتاج اسم فقط الآن)
app.post('/api/users', async (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ message: "Name is required" });
  }

  try {
    const user = new User({ 
      name, 
      points: 0, 
      total: 0, 
      details: [] 
    });
    const newUser = await user.save();
    res.status(201).json(newUser);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update user
app.put('/api/users/:name', async (req, res) => {
  const { name } = req.params;
  const { name: newName } = req.body;

  try {
    const user = await User.findOne({ name });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (newName) user.name = newName;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete user
app.delete('/api/users/:name', async (req, res) => {
  try {
    const user = await User.findOneAndDelete({ name: req.params.name });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add details (تعديل لإضافة النقاط وتحديث الإجمالي)
app.post('/api/users/:name/details', async (req, res) => {
  const { exam, points, total } = req.body;
  
  if (!exam || points === undefined || total === undefined) {
    return res.status(400).json({ message: "Exam, points and total are required" });
  }

  try {
    const user = await User.findOne({ name: req.params.name });
    if (!user) return res.status(404).json({ message: "User not found" });

    // إضافة التفاصيل الجديدة
    user.details.push({ exam, points, total });
    
    // تحديث النقاط والإجمالي للطالب
    user.points += points;
    user.total += total;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update detail (جديد)
app.put('/api/users/:userId/details/:detailId', async (req, res) => {
  const { userId, detailId } = req.params;
  const { exam, points, total } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const detail = user.details.id(detailId);
    if (!detail) return res.status(404).json({ message: "Detail not found" });

    // حفظ القيم القديمة لحساب الفرق
    const oldPoints = detail.points;
    const oldTotal = detail.total;

    // تحديث القيم
    if (exam) detail.exam = exam;
    if (points !== undefined) detail.points = points;
    if (total !== undefined) detail.total = total;

    // تحديث النقاط والإجمالي للطالب
    user.points = user.points - oldPoints + detail.points;
    user.total = user.total - oldTotal + detail.total;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete detail (جديد)
app.delete('/api/users/:userId/details/:detailId', async (req, res) => {
  const { userId, detailId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const detail = user.details.id(detailId);
    if (!detail) return res.status(404).json({ message: "Detail not found" });

    // تحديث النقاط والإجمالي للطالب
    user.points -= detail.points;
    user.total -= detail.total;

    // حذف التفاصيل
    user.details.pull(detailId);
    
    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});