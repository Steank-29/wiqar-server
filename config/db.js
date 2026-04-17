const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    // For each collection, get the document count
    console.log(`\n📚 Collections Summary:`);
    for (const collection of collections) {
      const collectionName = collection.name;
      const count = await mongoose.connection.db.collection(collectionName).countDocuments();
      console.log(`   📁 ${collectionName}: ${count} ${count === 1 ? 'document' : 'documents'}`);
    }
    console.log(''); // Empty line for cleaner output
    
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;