const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user');

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@perfume.com' });
    
    if (adminExists) {
      console.log('Admin already exists');
      process.exit(0);
    }

    const adminData = {
      firstName: 'Sami',
      lastName: 'Jelassi',
      email: 'SamiJelassi@wiqar.com',
      password: '123123123',
      dateOfBirth: new Date('1999-09-29'),
      gender: 'male',
      phoneNumber: '+21623265016',
      role: 'admin',
      isActive: true
    };

    const admin = await User.create(adminData);
    
    console.log('Admin created successfully:', {
      name: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      role: admin.role
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();