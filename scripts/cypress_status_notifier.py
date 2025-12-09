import requests
import os
from random import randint



messages = [
"""> 🛠️ **Cypress Run Completed**  
> **Title:** _{TITLE}_  
> 👤 Author: `{AUTHOR}`  
> 🔗 [View PR]({URL})  
>  **Job Status:** _{STATUS}_
>  **Run Url:** _{RUN_URL}_
> Dev team, jump in for review when you can!
""",]


def send_message():
    BOT_TOKEN = os.getenv('BOT_TOKEN')
    ROOM_ID = os.getenv('ROOM_ID')
    URL = os.getenv('url')
    TITLE = os.getenv('title')
    AUTHOR = os.getenv('author')
    STATUS = os.getenv('status')
    RUN_URL = os.getenv('run_url')

    url = 'https://webexapis.com/v1/messages'
    headers = {
        'Authorization': f'Bearer {BOT_TOKEN}',
        'Content-Type': 'application/json'
    }
    data = {        
        'roomId': ROOM_ID,
        'markdown': getRandomMessage().format(TITLE=TITLE, AUTHOR=AUTHOR, URL=URL, STATUS=STATUS, RUN_URL=RUN_URL),
    }

    requests.post(url, headers=headers, json=data)

def getRandomMessage():

    return messages[randint(0, len(messages) - 1)]

send_message()
