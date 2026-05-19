import requests

def test():
    # Login to get token
    login_url = "http://localhost:8000/api/v1/auth/login"
    login_payload = {
        "email": "admin@gridtwin.ng",
        "password": "admin123"
    }
    
    try:
        response = requests.post(login_url, json=login_payload)
        print("Login status:", response.status_code)
        if response.status_code != 200:
            print("Login failed:", response.text)
            return
        
        token = response.json()["access_token"]
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        # Call simulate/outage
        outage_url = "http://localhost:8000/api/v1/simulate/outage"
        outage_payload = {
            "asset_type": "feeder",
            "asset_id": 1,
            "duration_hours": 4.0
        }
        
        print("Sending outage request to:", outage_url)
        outage_response = requests.post(outage_url, json=outage_payload, headers=headers)
        print("Outage response status:", outage_response.status_code)
        print("Outage response body:", outage_response.text)
        
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
