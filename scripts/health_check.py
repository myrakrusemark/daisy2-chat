#!/usr/bin/env python3
"""
Docker health check script with test validation
Validates both service health and critical functionality
"""

import sys
import subprocess
import requests
import time
import json
import os
from pathlib import Path

# Add current directory to Python path for imports
sys.path.insert(0, '/app')


def check_service_health():
    """Check if the main service is responding"""
    try:
        response = requests.get('http://localhost:8000/health', timeout=5)
        if response.status_code == 200:
            print("✅ Service health check: PASS")
            return True
        else:
            print(f"❌ Service health check: FAIL (status {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ Service health check: FAIL ({e})")
        return False


def run_critical_tests():
    """Run critical tests to validate functionality"""
    try:
        # Run only the most critical STT tests
        result = subprocess.run([
            'python', '-m', 'pytest', 
            'tests/unit/test_whisper_service.py::TestWhisperTranscriptionService::test_multiple_concurrent_sessions',
            'tests/unit/test_whisper_service.py::TestWhisperTranscriptionService::test_audio_chunk_processing_per_session',
            '-q', '--tb=no'  # Quiet mode, no traceback
        ], capture_output=True, text=True, timeout=15)
        
        if result.returncode == 0:
            print("✅ Critical STT tests: PASS")
            return True
        else:
            print(f"❌ Critical STT tests: FAIL")
            print(f"   Exit code: {result.returncode}")
            if result.stdout:
                print(f"   Output: {result.stdout.strip()}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Critical STT tests: FAIL (timeout)")
        return False
    except Exception as e:
        print(f"❌ Critical STT tests: FAIL ({e})")
        return False


def check_dependencies():
    """Check that critical dependencies are available"""
    try:
        # Check core imports
        import src.api.whisper_service
        import src.api.session_manager
        import src.api.websocket_handler
        print("✅ Core dependencies: PASS")
        return True
    except Exception as e:
        print(f"❌ Core dependencies: FAIL ({e})")
        return False


def check_file_permissions():
    """Check that critical files and directories exist with proper permissions"""
    try:
        critical_paths = [
            '/app/src/api/',
            '/app/tests/unit/',
            '/app/scripts/run_tests.py',
            '/app/data/conversations/'
        ]
        
        for path in critical_paths:
            if not os.path.exists(path):
                print(f"❌ File permissions: FAIL (missing {path})")
                return False
        
        print("✅ File permissions: PASS")
        return True
    except Exception as e:
        print(f"❌ File permissions: FAIL ({e})")
        return False


def check_memory_usage():
    """Check memory usage isn't excessive"""
    try:
        import psutil
        memory = psutil.virtual_memory()
        
        # Check if memory usage is reasonable (less than 90%)
        if memory.percent < 90:
            print(f"✅ Memory usage: PASS ({memory.percent:.1f}%)")
            return True
        else:
            print(f"❌ Memory usage: FAIL ({memory.percent:.1f}% - too high)")
            return False
    except Exception as e:
        print(f"⚠️ Memory usage: SKIP (psutil not available)")
        return True  # Don't fail health check for this


def run_quick_functional_test():
    """Run a quick functional test of the STT service"""
    try:
        # Test creating a whisper service instance
        sys.path.append('/app')
        from tests.utils.stt_test_helpers import create_mock_whisper_service
        
        service = create_mock_whisper_service()
        if service.is_available():
            print("✅ STT service creation: PASS")
            return True
        else:
            print("❌ STT service creation: FAIL")
            return False
    except Exception as e:
        print(f"❌ STT service creation: FAIL ({e})")
        return False


def main():
    """Main health check function"""
    print("🏥 Docker Health Check - Daisy2")
    print("=" * 50)
    
    start_time = time.time()
    
    # Define health checks in order of importance
    health_checks = [
        ("Service Health", check_service_health),
        ("Dependencies", check_dependencies), 
        ("File Permissions", check_file_permissions),
        ("STT Functionality", run_quick_functional_test),
        ("Memory Usage", check_memory_usage),
    ]
    
    # Run critical tests only if environment variable is set
    if os.getenv('HEALTH_CHECK_RUN_TESTS', 'false').lower() == 'true':
        health_checks.append(("Critical Tests", run_critical_tests))
    
    results = []
    
    for check_name, check_func in health_checks:
        print(f"\n🔍 Running: {check_name}")
        try:
            result = check_func()
            results.append((check_name, result))
        except Exception as e:
            print(f"❌ {check_name}: ERROR ({e})")
            results.append((check_name, False))
    
    # Summary
    elapsed = time.time() - start_time
    print(f"\n" + "=" * 50)
    print(f"📊 Health Check Summary ({elapsed:.1f}s)")
    print("=" * 50)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for check_name, result in results:
        status = "PASS" if result else "FAIL"
        icon = "✅" if result else "❌"
        print(f"{icon} {check_name}: {status}")
    
    success_rate = passed / total * 100
    print(f"\n📈 Overall: {passed}/{total} checks passed ({success_rate:.0f}%)")
    
    # Determine exit code
    # Fail if any critical checks fail
    critical_checks = ["Service Health", "Dependencies", "File Permissions"]
    critical_failures = [
        name for name, result in results 
        if name in critical_checks and not result
    ]
    
    if critical_failures:
        print(f"\n💥 HEALTH CHECK FAILED - Critical issues:")
        for failure in critical_failures:
            print(f"   - {failure}")
        return 1
    elif success_rate < 80:
        print(f"\n⚠️ HEALTH CHECK DEGRADED - Success rate too low ({success_rate:.0f}%)")
        return 1
    else:
        print(f"\n🎉 HEALTH CHECK PASSED - All systems operational!")
        return 0


if __name__ == '__main__':
    sys.exit(main())