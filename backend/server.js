const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();




const app = express();
const PORT = process.env.PORT || 8386;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Connection
const uri = process.env.MONGODB_URI;
mongoose.connect(uri, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log("Connected to MongoDB Atlas"))
.catch(err => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    unique: true
  },
  points: { 
    type: Number, 
    default: 0,
    min: 0
  },
  total: { 
    type: Number, 
    default: 0,
    min: 0
  },
  details: [{
    exam: {
      type: String,
      required: true,
      trim: true
    },
    points: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 1
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add validation for points <= total
userSchema.path('details').validate(function(details) {
  for (const detail of details) {
    if (detail.points > detail.total) {
      return false;
    }
  }
  return true;
}, 'النقاط لا يمكن أن تكون أكثر من الإجمالي');

const User = mongoose.model('User', userSchema);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'حدث خطأ في الخادم' });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Get all users sorted by points (descending)
app.get('/api/users', async (req, res, next) => {
  try {
    const users = await User.find()
      .sort({ points: -1, createdAt: -1 })
      .select('-__v');
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// Get single user by name
app.get('/api/users/name/:name', async (req, res, next) => {
  try {
    const user = await User.findOne({ name: req.params.name })
      .select('-__v');
    
    if (!user) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }
    
    // Sort details by creation date (newest first)
    user.details.sort((a, b) => b.createdAt - a.createdAt);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Create new user (name only)
app.post('/api/users', async (req, res, next) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "اسم الطالب مطلوب" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ message: "الطالب موجود بالفعل" });
    }

    const user = new User({ 
      name: name.trim(),
      points: 0,
      total: 0,
      details: []
    });

    const newUser = await user.save();
    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      points: newUser.points,
      total: newUser.total
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

// Update user name
app.put('/api/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "اسم الطالب مطلوب" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    // Check if new name already exists
    if (name !== user.name) {
      const existingUser = await User.findOne({ name });
      if (existingUser) {
        return res.status(400).json({ message: "الطالب موجود بالفعل" });
      }
    }

    user.name = name.trim();
    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      points: updatedUser.points,
      total: updatedUser.total
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }
    res.json({ message: "تم حذف الطالب بنجاح" });
  } catch (err) {
    next(err);
  }
});

// Add new exam details
app.post('/api/users/name/:name/details', async (req, res, next) => {
  try {
    const { exam, points, total } = req.body;
    
    if (!exam || !exam.trim()) {
      return res.status(400).json({ message: "اسم الاختبار مطلوب" });
    }
    
    if (points === undefined || isNaN(points) || points < 0) {
      return res.status(400).json({ message: "النقاط يجب أن تكون رقمًا موجبًا" });
    }
    
    if (total === undefined || isNaN(total) || total < 1) {
      return res.status(400).json({ message: "الإجمالي يجب أن يكون رقمًا أكبر من الصفر" });
    }
    
    if (points > total) {
      return res.status(400).json({ message: "النقاط لا يمكن أن تكون أكثر من الإجمالي" });
    }

    const user = await User.findOne({ name: req.params.name });
    if (!user) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    // Add new details
    const newDetail = { 
      exam: exam.trim(),
      points: Number(points),
      total: Number(total)
    };
    
    user.details.push(newDetail);
    
    // Update total points and total
    user.points += Number(points);
    user.total += Number(total);

    const updatedUser = await user.save();
    
    // Get the added detail with its _id
    const addedDetail = updatedUser.details.find(d => 
      d.exam === newDetail.exam && 
      d.points === newDetail.points && 
      d.total === newDetail.total
    );
    
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      points: updatedUser.points,
      total: updatedUser.total,
      detail: {
        _id: addedDetail._id,
        exam: addedDetail.exam,
        points: addedDetail.points,
        total: addedDetail.total,
        createdAt: addedDetail.createdAt
      }
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

// Update exam details
app.put('/api/users/name/:name/details/:detailId', async (req, res, next) => {
  try {
    const { name, detailId } = req.params;
    const { exam, points, total } = req.body;

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const detail = user.details.id(detailId);
    if (!detail) {
      return res.status(404).json({ message: "تفاصيل الاختبار غير موجودة" });
    }

    // Validate inputs
    const newExam = exam !== undefined ? exam.trim() : detail.exam;
    const newPoints = points !== undefined ? Number(points) : detail.points;
    const newTotal = total !== undefined ? Number(total) : detail.total;

    if (!newExam) {
      return res.status(400).json({ message: "اسم الاختبار مطلوب" });
    }
    
    if (newPoints < 0) {
      return res.status(400).json({ message: "النقاط يجب أن تكون رقمًا موجبًا" });
    }
    
    if (newTotal < 1) {
      return res.status(400).json({ message: "الإجمالي يجب أن يكون رقمًا أكبر من الصفر" });
    }
    
    if (newPoints > newTotal) {
      return res.status(400).json({ message: "النقاط لا يمكن أن تكون أكثر من الإجمالي" });
    }

    // Calculate differences
    const pointsDiff = newPoints - detail.points;
    const totalDiff = newTotal - detail.total;

    // Update the detail
    detail.exam = newExam;
    detail.points = newPoints;
    detail.total = newTotal;

    // Update user totals
    user.points += pointsDiff;
    user.total += totalDiff;

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      points: updatedUser.points,
      total: updatedUser.total,
      detail: {
        _id: detail._id,
        exam: detail.exam,
        points: detail.points,
        total: detail.total,
        createdAt: detail.createdAt
      }
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

// Delete exam details
app.delete('/api/users/name/:name/details/:detailId', async (req, res, next) => {
  try {
    const { name, detailId } = req.params;

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const detail = user.details.id(detailId);
    if (!detail) {
      return res.status(404).json({ message: "تفاصيل الاختبار غير موجودة" });
    }

    // Update user totals
    user.points -= detail.points;
    user.total -= detail.total;

    // Remove the detail
    user.details.pull(detailId);
    
    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      points: updatedUser.points,
      total: updatedUser.total,
      message: "تم حذف تفاصيل الاختبار بنجاح"
    });
  } catch (err) {
    next(err);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
});