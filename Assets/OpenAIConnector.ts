import { Interactable } from 'SpectaclesInteractionKit/Components/Interaction/Interactable/Interactable'
import { validate } from './SpectaclesInteractionKit/Utils/validate'
let cameraModule = require('LensStudio:CameraModule')
let internetModule = require('LensStudio:InternetModule')


@component
export class OpenAIConnector extends BaseScriptComponent {
  @input buttonForImageAndText!: Interactable
  @input buttonForText!: Interactable

  @input responseText: Text
  @input imagePromptText: string = 'Describe the contents of this image.'
  @input promptText: string = 'Roast me as a snapchat user.'

  @input systemPrompt: string = 'You are a helpful assistant.'
  @input openAIApiKey: string = 'YOUR_OPENAI_API_KEY_HERE'
  @input @label('Model Index (see Output panel for options)')
  modelIndex: number = 0

  private readonly modelNames: string[] = [
    'gpt-5.4',       // 0  - Most capable
    'gpt-5.4-pro',   // 1  - Smarter, more precise
    'gpt-5-mini',    // 2  - Fast, cost-efficient
    'gpt-5-nano',    // 3  - Fastest, cheapest
    'gpt-5',         // 4  - Previous frontier
    'gpt-4.1',       // 5  - Smartest non-reasoning
    'gpt-4.1-mini',  // 6  - Smaller, faster 4.1
    'gpt-4.1-nano',  // 7  - Fastest 4.1
    'gpt-4o',        // 8  - Fast, flexible
    'gpt-4o-mini',   // 9  - Affordable, focused
    'gpt-4-turbo',   // 10 - Older high-intelligence
    'o3',            // 11 - Reasoning
    'o3-pro',        // 12 - Reasoning, more compute
    'o3-mini',       // 13 - Reasoning, small
    'o4-mini',       // 14 - Fast reasoning
    'o1',            // 15 - Previous reasoning
  ]

  private isLoading: boolean = false
  private cameraTexture: any

  private setError(msg: string) {
    this.isLoading = false
    this.responseText.text = msg
  }

  createCameraRequest = () => {
    if (this.isLoading) return

    let cameraRequest = CameraModule.createCameraRequest()
    cameraRequest.cameraId = CameraModule.CameraId.Left_Color

    this.cameraTexture = cameraModule.requestCamera(cameraRequest)

    let onNewFrame = this.cameraTexture.control.onNewFrame
    let registration = onNewFrame.add(() => {
      Base64.encodeTextureAsync(
        this.cameraTexture,
        (successFrame) => {
          print('Success: Image captured successfully')
          const messages = [
            {
              role: 'user',
              content: [
                { type: 'text', text: this.imagePromptText },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${successFrame}` } },
              ],
            },
          ]
          this.callOpenAI(messages)
        },
        () => {
          print('Error encoding camera texture.')
          this.setError('Failed to capture image.')
        },
        CompressionQuality.HighQuality,
        EncodingType.Jpg
      )

      onNewFrame.remove(registration)
    })
  }

  private async callOpenAI(messages: any[]): Promise<void> {
    if (this.isLoading) return
    this.isLoading = true
    this.responseText.text = 'Thinking...'

    try {
      const url = 'https://api.openai.com/v1/chat/completions'
      const request = new Request(url, {
        method: 'POST',
        body: JSON.stringify({
          model: this.modelNames[this.modelIndex] ?? 'gpt-5.4',
          messages: this.systemPrompt
            ? [{ role: 'system', content: this.systemPrompt }, ...messages]
            : messages,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openAIApiKey}`,
        },
      })

      const response = await internetModule.fetch(request)
      if (response.status === 200) {
        const responseJson = await response.json()
        this.handleOpenAIResponse(responseJson)
      } else {
        const errorText = await response.text()
        print('OpenAI request failed: ' + errorText)
        this.setError('Error ' + response.status + ': ' + errorText)
      }
    } catch (error) {
      print('Error calling OpenAI: ' + error)
      this.setError('Error: ' + error)
    }
  }

  sendImageAndPromptToOpenAI(image: any, prompt: string) {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
        ],
      },
    ]
    this.callOpenAI(messages)
  }

  sendPromptToOpenAI(prompt: string) {
    const messages = [
      {
        role: 'user',
        content: prompt,
      },
    ]
    this.callOpenAI(messages)
  }

  handleOpenAIResponse(response) {
    const content = response.choices[0].message.content
    print('OpenAI response: ' + content)
    this.responseText.text = content
    this.isLoading = false
  }

  onAwake(): void {
    if (this.openAIApiKey === 'YOUR_OPENAI_API_KEY_HERE') {
      print('WARNING: OpenAI API key is not set. Update openAIApiKey in the Inspector.')
    }

    print('Available models:')
    this.modelNames.forEach((name, i) => print('  ' + i + ': ' + name))
    print('Selected model: ' + (this.modelNames[this.modelIndex] ?? 'gpt-5.4 (fallback)'))

    validate(this.buttonForImageAndText)
    this.buttonForImageAndText.onTriggerEnd.add(this.createCameraRequest)

    validate(this.buttonForText)
    this.buttonForText.onTriggerEnd.add(() => this.sendPromptToOpenAI(this.promptText))
  }
}
