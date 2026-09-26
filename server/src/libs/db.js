import dns from "node:dns"
import mongoose from "mongoose"

export const connectDb = async () => {
    try {
        const dnsServers = (process.env.MONGODB_DNS_SERVERS || "")
            .split(",")
            .map((server) => server.trim())
            .filter(Boolean)

        if (dnsServers.length > 0) {
            dns.setServers(dnsServers)
        }

        await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING)
        console.log("Connect database successfully")
    } catch (error) {
        console.log("Error to connect database: ", error)
        //to stop if can not connect to db
        process.exit(1)
    }
}
