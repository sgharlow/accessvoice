"""Quick test to verify Bedrock access for Nova models in us-east-1."""

import json
import boto3
from dotenv import load_dotenv

load_dotenv()


def test_nova_lite():
    """Test Nova 2 Lite with a simple text prompt."""
    print("Testing Nova 2 Lite (text)...")
    client = boto3.client("bedrock-runtime", region_name="us-west-2")

    response = client.converse(
        modelId="us.amazon.nova-2-lite-v1:0",
        messages=[
            {
                "role": "user",
                "content": [{"text": "Say 'AccessVoice is ready!' and nothing else."}],
            }
        ],
        inferenceConfig={"maxTokens": 50},
    )

    text = response["output"]["message"]["content"][0]["text"]
    print(f"  Response: {text}")
    print(f"  Stop reason: {response['stopReason']}")
    print("  Nova Lite: OK\n")


def test_list_models():
    """List available Nova models."""
    print("Listing Nova models in us-west-2...")
    client = boto3.client("bedrock", region_name="us-west-2")

    response = client.list_foundation_models()
    nova_models = [
        m for m in response["modelSummaries"]
        if "nova" in m["modelId"].lower()
    ]

    for m in nova_models:
        status = m.get("modelLifecycle", {}).get("status", "unknown")
        print(f"  {m['modelId']} — {status}")

    print(f"  Found {len(nova_models)} Nova models\n")


if __name__ == "__main__":
    print("=" * 50)
    print("AccessVoice — Bedrock Connection Test")
    print("=" * 50 + "\n")

    try:
        test_list_models()
    except Exception as e:
        print(f"  FAILED listing models: {e}\n")

    try:
        test_nova_lite()
    except Exception as e:
        print(f"  FAILED calling Nova Lite: {e}\n")
        print("  If 'AccessDeniedException': model access not yet approved.")
        print("  If 'credentials' error: check your .env or AWS profile.\n")

    print("=" * 50)
    print("Done. If both passed, Phase 0 is complete!")
    print("=" * 50)
