require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
const admin = require("firebase-admin");

const serviceAccount = require("./bloodx-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//middleware
app.use(cors())
app.use(express.json())

const verifyFBToken=async(req,res,next)=>{
    const header = req.headers.authorization
    if(!header){
        res.status(401).send({message: 'unauthorized access'})
    }
    const token = header.split(' ')[1]
    if(!token){
        res.status(401).send({message: 'unauthorized access'})
    }
    try{
        const decoded = await admin.auth().verifyIdToken(token)
        req.decoded_email = decoded.email
        next();
    }
    catch(error){
        res.status(401).send({message: 'unauthorized access'})
    }

}



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


    //
    //user related api
    app.get('/users/:email/role',verifyFBToken, async(req,res)=>{

        const email = req.params.email

        const query ={email}
        const result = await usersCollection.findOne(query)
        res.send(result);
    })
    app.post('/users',async(req,res)=>{
        const userInfo = req.body
        userInfo.role = 'Donor'
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
    //admin control api
    app.get('/users',async(req,res)=>{
        const {status,limit=0,skip=0} = req.query
        const query = {}
        if(status){
            query.status = status
        }

        const result = await usersCollection.find(query).sort({createdAt: -1}).skip(parseInt(skip)).limit(parseInt(limit)).toArray()
        const totalUsers = await usersCollection.estimatedDocumentCount()

        res.send({result,totalUsers})
    })
    //admin controlled---> update user status
    app.patch('/users/:id/changeStatus',async(req,res)=>{
        const id = req.params.id;
        const statusInfo =req.body;
        const query ={_id: new ObjectId(id)}
        const updatedDoc = {
            $set: {
                status: statusInfo.status
            }
        }
        const result = await usersCollection.updateOne(query,updatedDoc)
        res.send(result);
    })
    //admin controlled---> update user role
    app.patch('/users/:id/changeRole',async(req,res)=>{
        const id = req.params.id;
        const roleInfo =req.body;
        const query ={_id: new ObjectId(id)}
        const updatedDoc = {
            $set: {
                role: roleInfo.role
            }
        }
        const result = await usersCollection.updateOne(query,updatedDoc)
        res.send(result);
    })


    //Donation request related api
    app.get('/donationRequests', async(req,res)=>{
            const {email,donationStatus,limit=0,skip=0} =req.query
            const query = {}
            if(email){
             query.requesterEmail = email
            }
            if(donationStatus){
                query.donationStatus = donationStatus
            }
            const result = await donationRequestsCollection.find(query).sort({createdAt: -1}).skip(parseInt(skip)).limit(parseInt(limit)).toArray()
            const totalRequests = await donationRequestsCollection.countDocuments({requesterEmail: email});
            const totalData = await donationRequestsCollection.estimatedDocumentCount()
            res.send({result,totalRequests,totalData})
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