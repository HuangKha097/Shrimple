import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Check for missing keys
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("Cloudinary API keys are missing in .env file! Media uploads will fail.");
}

const uploadToCloudinary = async (localFilePath, folder = "shrimple_chat") => {
    try {
        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            folder: folder
        });

        // File has been uploaded successfully
        // Remove file from local
        fs.unlinkSync(localFilePath);
        return response;

    } catch (error) {
        fs.unlinkSync(localFilePath); // Remove local file as upload failed
        console.error("Cloudinary upload failed:", error);
        return null; // or throw error
    }
}


const deleteFromCloudinary = async (publicId, resourceType = "image") => {
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.error("Cloudinary delete failed:", error);
    }
}

export { uploadToCloudinary, deleteFromCloudinary };

