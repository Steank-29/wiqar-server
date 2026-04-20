// reset-password.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
require('dotenv').config();

const resetPassword = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('123123123', salt);
  
  const result = await User.updateOne(
    { email: "samijelassi@wiqar.com" },
    { $set: { password: hashedPassword } }
  );
  
  console.log('Password reset result:', result);
  process.exit();
};

resetPassword();