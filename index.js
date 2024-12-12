const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const app = express();
const port = 3000;

// Middleware to parse JSON requests
app.use(express.json());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// POST endpoint to upload file to OpenAI
app.post('/upload', async (req, res) => {
  const openAiApiKey = req.body.openAiApiKey; // OpenAI API Key from request body
  const fileUrl = req.body.fileUrl; // File URL from request body

  if (!openAiApiKey || !fileUrl) {
    return res.status(400).json({ error: 'API Key and File URL are required.' });
  }

  try {
    // Extract file name and extension from URL
    const fileNameMatch = fileUrl.match(/public%2F(.*?)\?/);
    if (!fileNameMatch || !fileNameMatch[1]) {
      return res.status(400).json({ error: 'Invalid file URL format.' });
    }

    const fileName = decodeURIComponent(fileNameMatch[1]);
    const fileExtension = path.extname(fileName).substring(1).toLowerCase();

    // Restrict allowed file types to text, images, and documents
    const validExtensions = ['txt', 'jpeg', 'jpg', 'png', 'gif', 'webp', 'doc', 'docx', 'pdf'];
    if (!validExtensions.includes(fileExtension)) {
      return res.status(400).json({ error: `Unsupported file extension: ${fileExtension}. Supported extensions are: ${validExtensions.join(', ')}` });
    }

    // Determine file type category
    const isImage = ['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(fileExtension);
    const isDocument = ['txt', 'doc', 'docx', 'pdf'].includes(fileExtension);

    // Download the file from the provided URL
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data);

    // Save the file to a temporary location
    const tempFilePath = path.join(uploadDir, fileName);
    fs.writeFileSync(tempFilePath, fileBuffer);

    // Prepare the file for upload
    const fileStream = fs.createReadStream(tempFilePath);
    const formData = new FormData();
    formData.append('purpose', 'assistants');
    formData.append('file', fileStream, {
      filename: fileName,
      contentType: `application/${fileExtension}`,
    });

    // Make the API request to OpenAI
    const apiResponse = await axios.post(
      'https://api.openai.com/v1/files',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`,
          ...formData.getHeaders(), // Ensure correct Content-Type header is set
        },
      }
    );

    // Return file ID and type category from the OpenAI response
    res.json({
      fileId: apiResponse.data.id,
      fileType: isImage ? 'image' : isDocument ? 'document' : 'unknown'
    });

    // Clean up the temporary file after processing
    fs.unlinkSync(tempFilePath);

  } catch (err) {
    console.error('Error uploading file to OpenAI:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: 'Error uploading file to OpenAI' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
