import { Interactable } from "SpectaclesInteractionKit/Components/Interaction/Interactable/Interactable";
import {validate} from "./SpectaclesInteractionKit/Utils/validate"
let cameraModule = require('LensStudio:CameraModule');
let remoteServiceModule = require('LensStudio:RemoteServiceModule');

// CaptureFood.js
@component
export class CaptureFood extends BaseScriptComponent{
    
    @input buttonForImageAndText!: Interactable
    @input buttonForText!: Interactable

    @input responseText: Text
    @input imagePromptText: string = "Describe the contents of this image.";
    @input promptText: string = "Roast me as a snapchat user.";

    @input openAIClientID: string = "YOUR_OPENAI_API_KEY_HERE";
    @input imgurClientID: string = "YOUR_IMGUR_CLIENT_ID_HERE";

    private cameraTexture: any;


    // Create a camera request
    createCameraRequest = () => {

    let cameraRequest = CameraModule.createCameraRequest();
    cameraRequest.cameraId = CameraModule.CameraId.Left_Color;

    this.cameraTexture = cameraModule.requestCamera(cameraRequest);

    let onNewFrame = this.cameraTexture.control.onNewFrame;
    let registration = onNewFrame.add(() => {
        Base64.encodeTextureAsync(this.cameraTexture, (successFrame) => {
            print("Success: Image captured successfully");
            this.sendImageAndPromptToOpenAI(successFrame, this.imagePromptText);
    }
        , () =>{},
        CompressionQuality.HighQuality,
        EncodingType.Jpg)
        
        onNewFrame.remove(registration);
    });

    }

    async uploadBase64ImageToImgur(base64Image: any): Promise<string> {
        const url = "https://api.imgur.com/3/image";
        const clientId = this.imgurClientID;
    
        const request = new Request(url, {
            method: 'POST',
            body: JSON.stringify({
                image: base64Image,
                type: 'base64'
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Client-ID ${clientId}`
            }
        });
    
        try {
            const response = await remoteServiceModule.fetch(request);
            if (response.status === 200) {
                const responseJson = await response.json();
                return responseJson.data.link;
            } else {
                const errorText = await response.text();
                print('Imgur upload failed:' + errorText);
                throw new Error('Failed to upload image to Imgur');
            }
        } catch (error) {
            print('Error uploading image to Imgur:' + error);
            throw error;
        }
    }

    async sendImageAndPromptToOpenAI(image: any, prompt: string) {
        try {
            const imageUrl = await this.uploadBase64ImageToImgur(image);
            const url = "https://api.openai.com/v1/chat/completions";
            const request = new Request(url, {
                method: 'POST',
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: prompt },
                                { type: "image_url", image_url: { url: imageUrl } }
                            ]
                        }
                    ]
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openAIClientID}` 
                }
            });
    
            const response = await remoteServiceModule.fetch(request);
            if (response.status === 200) {
                const responseJson = await response.json();
                this.handleOpenAIResponse(responseJson);
            } else {
                const errorText = await response.text();
                print('OpenAI request failed:'+ errorText);
                throw new Error('Failed to get response from OpenAI');
            }
        } catch (error) {
            print('Error sending image and prompt to OpenAI:'+ error);
        }
    }
    async sendPromptToOpenAI(prompt: string) {
        try {
            const url = "https://api.openai.com/v1/chat/completions";
            const request = new Request(url, {
                method: 'POST',
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openAIClientID}` 
                }
            });
    
            const response = await remoteServiceModule.fetch(request);
            if (response.status === 200) {
                const responseJson = await response.json();
                this.handleOpenAIResponse(responseJson);
            } else {
                const errorText = await response.text();
                print('OpenAI request failed:' + errorText);
                throw new Error('Failed to get response from OpenAI');
            }
        } catch (error) {
            print('Error sending prompt to OpenAI:' + error);
        }
    }
    handleOpenAIResponse(response) {
        print("OpenAI response: " + response.choices[0].message.content);
        this.responseText.text = response.choices[0].message.content;
    }

    onAwake(): void {
        validate(this.buttonForImageAndText)
        this.buttonForImageAndText.onTriggerEnd.add(this.createCameraRequest);

        validate(this.buttonForText)
        this.buttonForText.onTriggerEnd.add(() => this.sendPromptToOpenAI(this.promptText));
    }
}


