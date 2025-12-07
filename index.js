require('dotenv').config()

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
const admin = require("firebase-admin");

let serviceAccount = require("./bloodx-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//middleware
app.use(cors())
app.use(express.json())




const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const bloodXDB = client.db('bloodXDB')
    const usersCollection = bloodXDB.collection('users')
    const donationRequestsCollection = bloodXDB.collection('donationRequests')

    //user related api
    app.get('/users/:email/role', async(req,res)=>{

        const email = req.params.email

        const query ={email}
        const result = await usersCollection.findOne(query)
        res.send(result);
    })
    app.post('/users',async(req,res)=>{
        const userInfo = req.body
        userInfo.role = 'Doner'
        userInfo.status = 'Active'
        userInfo.createdAt = new Date()
        const result = await usersCollection.insertOne(userInfo)
        res.send(result);
    })
    //user profile update
    app.patch('/users',async(req,res)=>{
        const updateInfo = req.body
        const query ={_id: new ObjectId(updateInfo._id)}
        const updatedDoc ={
            $set:{
                name: updateInfo.name,
                email:updateInfo.email,
                district: updateInfo.district,
                upzilla: updateInfo.upzilla,
                bloodGroup: updateInfo.bloodGroup
            }
        }
        const result = await usersCollection.updateOne(query,updatedDoc)
        res.send(result);
    })

    //Donation request related api
    app.get('/donationRequests', async(req,res)=>{
            const {email,limit=0,skip=0} =req.query
            const query = {}
            if(email){
             query.requesterEmail = email
            }
            const result = await donationRequestsCollection.find(query).sort({createdAt: -1}).skip(parseInt(skip)).limit(parseInt(limit)).toArray()
            const totalRequests = await donationRequestsCollection.countDocuments({requesterEmail: email});
            res.send({result,totalRequests})
    })
    app.get('/donationRequests/:id/request',async(req,res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await donationRequestsCollection.findOne(query)
        res.send(result);
    })

    app.get('/donationRequests/:email',async(req,res)=>{
        const email = req.params.email;
        const query ={requesterEmail:email}
        const result = await donationRequestsCollection.find(query).sort({createdAt: -1}).toArray()
        res.send(result);
    })

    app.post('/donationRequests',async(req,res)=>{
        const donationRequestData = req.body
        donationRequestData.createdAt = new Date()
        const result = await donationRequestsCollection.insertOne(donationRequestData)
        res.send(result);
    })
   app.patch('/donationRequests/:id/request', async(req,res)=>{
    const id = req.params.id;
    const data = req.body;
    const query ={_id: new ObjectId(id)}
    const updatedDoc = {
        $set:{
      bloodGroup: data.bloodGroup,
      donationDate: data.donationDate,
      donationTime: data.donationTime,
      fullAddress: data.fullAddress,
      hospitalName: data.hospitalName,
      recipientDistrict: data.recipientDistrict,
      recipientName: data.recipientName,
      recipientUpazila: data.recipientUpazila,
      requestMessage: data.requestMessage,
        }
    }
    const result =await donationRequestsCollection.updateOne(query,updatedDoc)
    res.send(result);
   })
   app.patch('/donationRequests/:id/status',async(req,res)=>{
    const {id}=req.params
    const {donationStatus}=req.body
    const query = {_id: new ObjectId(id)}
    const updatedDoc = {
        $set:{
            donationStatus: donationStatus
        }
    }
    const result =await donationRequestsCollection.updateOne(query,updatedDoc)
    res.send(result);
   })
   app.delete('/donationRequests/:id/request',async(req,res)=>{
       const {id} =req.params;
       const query = {_id: new ObjectId(id)}
       const result = await donationRequestsCollection.deleteOne(query)
       res.send(result);
   })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/',(req,res)=>{
    res.send('The Server is running properly')
})







const port = process.env.PORT || 4000
app.listen(port,()=>{
    console.log(`Server is runnig at port ${port}`)
})