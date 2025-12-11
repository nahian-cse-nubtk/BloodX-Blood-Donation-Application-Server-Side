require('dotenv').config()

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET)
const serviceAccount = require("./bloodx-firebase-adminsdk.json");
const { v4: uuidv4 } = require("uuid");

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

//tracking id generator
function generateTrackingId() {
  return "TRK-" + uuidv4();
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const bloodXDB = client.db('bloodXDB')
    const usersCollection = bloodXDB.collection('users')
    const donationRequestsCollection = bloodXDB.collection('donationRequests')
    const fundDonationCollection = bloodXDB.collection('funds')

    //middle for database admin access
    const verifyAdmin =async(req,res,next)=>{
        const email = req.decoded_email
        const query ={email}
        const user = await usersCollection.findOne(query)
        if(!user || user.role!=='Admin'){
            return res.status(403).send({message: 'access forbidden'})
        }
    }
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
   app.patch('/donationReqest/:id/acceptRequest',async(req,res)=>{
    const {id}=req.params
    const donorData = req.body;
    const query ={_id: new ObjectId(id)}
    const updatedDoc ={
        $set:{
            donorName:donorData.donorName,
            donorEmail: donorData.donorEmail,
            donationStatus: donorData.donationStatus
        }
    }
    const result = await donationRequestsCollection.updateOne(query,updatedDoc)
    res.send(result)
   })
   app.delete('/donationRequests/:id/request',async(req,res)=>{
       const {id} =req.params;
       const query = {_id: new ObjectId(id)}
       const result = await donationRequestsCollection.deleteOne(query)
       res.send(result);
   })
   //donor info send based on query
   app.post('/donorsData',async(req,res)=>{
    const {district,upzilla,bloodGroup}=req.body


    const query ={}
    if(district){
        query.district ={$regex: district, $options: 'i'}
    }
    if(upzilla){
        query.upzilla = {$regex: upzilla, $options: 'i'}
    }
    if(bloodGroup){
        query.bloodGroup =bloodGroup
    }
    const result = await usersCollection.find(query).toArray()

    res.send(result)
   })

   //payment related api

    app.post('/create-checkout-session',async(req,res)=>{
             const paymentInfo=req.body;

             const session = await stripe.checkout.sessions.create({
                line_items:[
                    {
                        price_data:{
                            currency:'usd',
                            unit_amount: parseInt(paymentInfo.donateAmount)*100,
                            product_data:{
                                name:'Fund Donate Money'
                            },

                        },
                        quantity: 1
                    }
                ],
                customer_email:paymentInfo.donorEmail,
                mode:'payment',
                metadata:{
                    customerName: paymentInfo.donorName,
                },
                success_url:`${process.env.SITE_DOMAIN}/paymentSussess?sessionId={CHECKOUT_SESSION_ID}`,
                cancel_url:`${process.env.SITE_DOMAIN}/paymentCancel`
             })
             res.send({url: session.url})
        })
//payment success api-->backend validataion

        app.patch('/payment-success',async(req,res)=>{
            const sessionId = req.query.sessionId
            const session =await stripe.checkout.sessions.retrieve(sessionId)

            if(session.payment_status==='paid'){
                const trackingId = generateTrackingId()
                const fundData={
                    donateAmount:session.amount_total/100,
                    donerEmail:session.customer_email,
                    donerName:session.metadata.customerName,
                    fundDonateAt: new Date(),
                    transectionId:session.payment_intent,
                    trackingId: trackingId
                }
                const query ={transectionId:session.payment_intent}
                const fundDataExists = await fundDonationCollection.findOne(query)

                if(fundDataExists){
                    return res.send({fundData:fundDataExists})
                }
                else{
                    const result =await fundDonationCollection.insertOne(fundData)
                    res.send({result,fundData})
                }

            }
        })
   //get funds data
   app.get('/donateFunds',async(req,res)=>{
    const {skip=0,limit=0}=req.query
    const result = await fundDonationCollection.find({}).project({donerName: 1,donateAmount: 1,fundDonateAt: 1}).sort({fundDonateAt: -1}).skip(parseInt(skip)).limit(parseInt(limit)).toArray()
    const totalFundData = await fundDonationCollection.estimatedDocumentCount()
    res.send({result,totalFundData})
   })
   // get statistics data
   app.get('/stats',async(req,res)=>{
    const totalFund = await fundDonationCollection.aggregate([
        {$group: {_id: null, total: {$sum: "$donateAmount"}}}
    ]).toArray();
    const totalDonor = await usersCollection.countDocuments({role: 'Donor'})
    const totalDonationRequets = await donationRequestsCollection.estimatedDocumentCount()
    res.send({totalFund: totalFund[0]?.total||0,totalDonor: totalDonor,donationRequests: totalDonationRequets})
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