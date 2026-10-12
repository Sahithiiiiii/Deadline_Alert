import {Queue} from "bullmq";
const reminderQueue=new Queue("deadline remainders",{
    connection:{
        host:process.env.REDIS_HOST||"localhost",
        port:Number(process.env.REDIS_HOST)||6379,
    }
})
export default reminderQueue;