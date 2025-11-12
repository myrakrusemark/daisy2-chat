#!/usr/bin/env python3
"""
Test runner script for the complete test suite
"""

import sys
import subprocess
import os
import argparse
from pathlib import Path


def run_command(cmd, description, cwd=None):
    """Run a command and report results"""
    print(f"\n🔄 {description}...")
    print(f"   Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd, 
            check=True, 
            capture_output=True, 
            text=True,
            cwd=cwd
        )
        print(f"✅ {description} passed")
        if result.stdout.strip():
            print(f"   Output: {result.stdout.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed")
        if e.stdout:
            print(f"   Stdout: {e.stdout}")
        if e.stderr:
            print(f"   Stderr: {e.stderr}")
        return False
    except FileNotFoundError:
        print(f"⚠️  {description} skipped (command not found)")
        return None


def main():
    parser = argparse.ArgumentParser(description='Run test suite')
    parser.add_argument('--unit', action='store_true', help='Run unit tests only')
    parser.add_argument('--integration', action='store_true', help='Run integration tests only')
    parser.add_argument('--e2e', action='store_true', help='Run E2E tests only')
    parser.add_argument('--performance', action='store_true', help='Run performance tests only')
    parser.add_argument('--frontend', action='store_true', help='Run frontend tests only')
    parser.add_argument('--lint', action='store_true', help='Run linting only')
    parser.add_argument('--all', action='store_true', help='Run all tests (default)')
    parser.add_argument('--fast', action='store_true', help='Skip slower tests')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    # If no specific test type specified, run all
    if not any([args.unit, args.integration, args.e2e, args.performance, args.frontend, args.lint]):
        args.all = True
    
    # Change to project root directory
    project_root = Path(__file__).parent.parent
    os.chdir(project_root)
    
    print("🧪 Running Cassistant Test Suite")
    print(f"   Project root: {project_root}")
    
    results = []
    
    # Python linting and type checking
    if args.lint or args.all:
        results.append(run_command(
            ['python', '-m', 'ruff', 'check', 'src/', 'tests/'],
            'Python linting (ruff check)'
        ))
        
        results.append(run_command(
            ['python', '-m', 'ruff', 'format', '--check', 'src/', 'tests/'],
            'Python formatting check (ruff format)'
        ))
        
        results.append(run_command(
            ['python', '-m', 'mypy', 'src/', '--ignore-missing-imports'],
            'Python type checking (mypy)'
        ))
    
    # JavaScript linting  
    if args.frontend or args.lint or args.all:
        results.append(run_command(
            ['npm', 'run', 'lint'],
            'JavaScript linting (eslint)'
        ))
    
    # Unit tests
    if args.unit or args.all:
        verbose_flag = ['-v'] if args.verbose else []
        results.append(run_command(
            ['python', '-m', 'pytest', 'tests/unit/', *verbose_flag, '--tb=short'],
            'Python unit tests'
        ))
    
    # Integration tests
    if args.integration or args.all:
        verbose_flag = ['-v'] if args.verbose else []
        results.append(run_command(
            ['python', '-m', 'pytest', 'tests/integration/', *verbose_flag, '--tb=short'],
            'Python integration tests'
        ))
    
    # Frontend tests
    if args.frontend or args.all:
        results.append(run_command(
            ['npm', 'test'],
            'JavaScript unit tests (Jest)'
        ))
    
    # Performance tests (only if not fast mode)
    if (args.performance or args.all) and not args.fast:
        verbose_flag = ['-v', '-s'] if args.verbose else ['-s']
        results.append(run_command(
            ['python', '-m', 'pytest', 'tests/performance/', *verbose_flag, '--tb=short'],
            'Performance tests'
        ))
    
    # E2E tests (only if not fast mode)
    if (args.e2e or args.all) and not args.fast:
        results.append(run_command(
            ['npx', 'playwright', 'test'],
            'End-to-end tests (Playwright)'
        ))
    
    # Report results
    print("\n" + "="*60)
    print("📊 Test Results Summary")
    print("="*60)
    
    passed = sum(1 for r in results if r is True)
    failed = sum(1 for r in results if r is False)
    skipped = sum(1 for r in results if r is None)
    total = len(results)
    
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⚠️  Skipped: {skipped}")
    print(f"📈 Total: {total}")
    
    if failed == 0:
        print(f"\n🎉 All tests passed! ({passed}/{total})")
        return 0
    else:
        print(f"\n💥 {failed} test suite(s) failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())