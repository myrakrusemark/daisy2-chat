# Sandbox Directory

This directory serves as the isolated workspace for Claude Code operations during voice assistant sessions.

## Purpose

- Provides a safe, contained environment for Claude to create and modify files
- Prevents accidental modifications to important system files
- All file operations are scoped to this directory by default

## Usage

The voice assistant automatically uses this directory as its working directory. Claude Code has full access to read, write, and execute operations within this sandbox.

## Security

**Important:** Do not create symlinks to sensitive directories (home, system folders, etc.) in this sandbox. This could expose private data to Claude Code operations.

## Cleanup

Files created during assistant sessions remain here for reference. You can safely delete files in this directory when no longer needed.
