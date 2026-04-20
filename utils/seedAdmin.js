const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user');

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const adminData = {
      firstName: 'Sami',
      lastName: 'Jelassi',
      email: 'samijelassi@wiqar.com',
      password: '123123123',
      dateOfBirth: new Date('1999-09-29'),
      gender: 'male',
      phoneNumber: '+21623265016',
      role: 'admin',
      isActive: true
    };

    // Check if admin exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    
    if (existingAdmin) {
      console.log('⚠️ Admin already exists. Updating password and info...');
      
      // Update existing admin
      existingAdmin.firstName = adminData.firstName;
      existingAdmin.lastName = adminData.lastName;
      existingAdmin.password = adminData.password; // This will trigger the pre-save hook
      existingAdmin.dateOfBirth = adminData.dateOfBirth;
      existingAdmin.gender = adminData.gender;
      existingAdmin.phoneNumber = adminData.phoneNumber;
      existingAdmin.isActive = adminData.isActive;
      
      await existingAdmin.save();
      
      console.log('✅ Admin updated successfully:', {
        name: `${existingAdmin.firstName} ${existingAdmin.lastName}`,
        email: existingAdmin.email,
        role: existingAdmin.role
      });
    } else {
      // Create new admin
      const admin = await User.create(adminData);
      
      console.log('✅ Admin created successfully:', {
        name: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        role: admin.role
      });
    }
    
    // Verify login credentials work
    const verifyUser = await User.findOne({ email: adminData.email }).select('+password');
    const isValidPassword = await verifyUser.matchPassword(adminData.password);
    
    if (isValidPassword) {
      console.log('✅ Password verification: SUCCESS');
      console.log('🔐 You can now login with:');
      console.log(`   Email: ${adminData.email}`);
      console.log(`   Password: ${adminData.password}`);
    } else {
      console.log('❌ Password verification: FAILED - Please check bcrypt configuration');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    if (error.code === 11000) {
      console.error('Duplicate key error. Try deleting the existing user first.');
    }
    process.exit(1);
  }
};

// Optional: Add force flag to delete existing user
if (process.argv.includes('--force')) {
  console.log('⚠️ Force mode enabled - will delete existing admin if found');
  seedAdmin().then(async () => {
    await mongoose.disconnect();
  });
} else {
  seedAdmin();
}