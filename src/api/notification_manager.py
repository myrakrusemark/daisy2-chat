"""Notification manager for workspace-specific dynamic content display"""

import os
import json
import yaml
import logging
import asyncio
import subprocess
import tempfile
from typing import Dict, Any, Optional, Union, List
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)


class NotificationManager:
    """Manage workspace notifications with support for scripts, MCP calls, and agent processing"""
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl = {}
        
    async def get_notification_content(self, working_dir: str, session_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Get notification content for a workspace session
        
        Args:
            working_dir: Path to workspace directory
            session_data: Session metadata for variable interpolation
            
        Returns:
            Dictionary with notification content or None if no notification configured
        """
        try:
            daisy_dir = Path(working_dir) / ".daisy"
            
            if not daisy_dir.exists():
                log.debug(f"No .daisy directory found at {daisy_dir}")
                return None
            
            # Look for notification config files (YAML preferred, JSON as fallback)
            config_file = None
            
            # Try YAML first
            yaml_config = daisy_dir / "notifications.yml"
            if yaml_config.exists():
                config_file = yaml_config
            else:
                # Try JSON as fallback
                json_config = daisy_dir / "notifications.json"
                if json_config.exists():
                    config_file = json_config
            
            if not config_file:
                log.debug(f"No notification config file found in {daisy_dir}")
                return None
            
            # Load configuration
            try:
                with open(config_file, 'r') as f:
                    if config_file.suffix == '.yml':
                        full_config = yaml.safe_load(f)
                    else:
                        full_config = json.load(f)
            except Exception as e:
                log.error(f"Error loading config file {config_file}: {e}")
                return None
            
            # Handle different config formats
            if isinstance(full_config, list):
                # Array of notifications
                notification_configs = full_config
            elif isinstance(full_config, dict):
                if 'notifications' in full_config:
                    # Object with notifications array
                    notification_configs = full_config['notifications']
                else:
                    # Single notification object (legacy)
                    notification_configs = [full_config]
            else:
                log.error(f"Invalid config format in {config_file}")
                return None
            
            notifications = []
            
            for i, config in enumerate(notification_configs):
                try:
                    if not isinstance(config, dict):
                        log.error(f"Invalid notification config at index {i}: not a dict")
                        continue
                        
                    if not config.get("enabled", True):
                        log.debug(f"Notification {i} disabled in config")
                        continue
                    
                    # Check cache if TTL is configured
                    notification_id = config.get("id", f"notification-{i}")
                    cache_key = f"{config_file}:{notification_id}:{config.get('cache_ttl', 0)}"
                    cache_ttl = config.get("cache_ttl", 0)
                    
                    cached_content = None
                    if cache_ttl > 0 and cache_key in self.cache:
                        cache_time, cached_content = self.cache[cache_key]
                        if (datetime.now().timestamp() - cache_time) < cache_ttl:
                            log.debug(f"Using cached content for {cache_key}")
                        else:
                            cached_content = None
                    
                    if cached_content:
                        notifications.append(cached_content)
                        continue
                        
                    # Process content based on type
                    content_type = config.get("content_type", "static")
                    content_config = config.get("content", {})
                    
                    if content_type == "static":
                        content = await self._process_static_content(content_config, session_data)
                    elif content_type == "script":
                        content = await self._process_script_content(content_config, session_data, working_dir)
                    elif content_type == "mcp":
                        content = await self._process_mcp_content(content_config, session_data)
                    elif content_type == "agent_processed":
                        content = await self._process_agent_content(content_config, session_data, working_dir)
                    else:
                        log.error(f"Unknown content_type in notification {i}: {content_type}")
                        continue
                        
                    notification = {
                        "content": content,
                        "style": config.get("style", "info"),
                        "id": notification_id,
                        "title": config.get("title", "")  # Optional title
                    }
                    
                    # Cache result if TTL configured
                    if cache_ttl > 0:
                        self.cache[cache_key] = (datetime.now().timestamp(), notification)
                        
                    notifications.append(notification)
                    
                except Exception as e:
                    log.error(f"Error processing notification {i}: {e}")
                    continue
            
            if not notifications:
                log.debug("No valid notifications found")
                return None
            
            # Preserve original order from YAML file (no sorting by priority)
            return {
                "notifications": notifications,
                "count": len(notifications)
            }
            
        except Exception as e:
            log.error(f"Error processing notification config: {e}")
            return None
            
    async def _process_static_content(self, content_config: Union[str, Dict], session_data: Dict[str, Any]) -> str:
        """Process static content with variable interpolation"""
        if isinstance(content_config, str):
            content_text = content_config
        else:
            content_text = content_config.get("text", "")
            
        # Perform variable substitution
        variables = {
            "sessionId": session_data.get("session_id", ""),
            "workingDir": session_data.get("working_dir", ""),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "time": datetime.now().strftime("%H:%M:%S"),
        }
        
        # Add any custom variables from config
        if isinstance(content_config, dict) and "variables" in content_config:
            for key, value in content_config["variables"].items():
                # Substitute variables in variable values
                for var_name, var_value in variables.items():
                    value = value.replace(f"${{{var_name}}}", str(var_value))
                variables[key] = value
        
        # Substitute all variables in content
        content = content_text
        for var_name, var_value in variables.items():
            content = content.replace(f"${{{var_name}}}", str(var_value))
            
        return content
        
    async def _process_script_content(self, content_config: Dict, session_data: Dict[str, Any], working_dir: str) -> str:
        """Execute script and return output"""
        script_command = content_config.get("script", "")
        if not script_command:
            return "Error: No script specified"
            
        try:
            # Change to working directory for script execution
            result = await asyncio.create_subprocess_shell(
                script_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode == 0:
                output = stdout.decode('utf-8').strip()
                return output if output else "Script executed successfully (no output)"
            else:
                error_msg = stderr.decode('utf-8').strip()
                log.error(f"Script execution failed: {error_msg}")
                return f"Script error: {error_msg}"
                
        except Exception as e:
            log.error(f"Error executing script: {e}")
            return f"Execution error: {str(e)}"
            
    async def _process_mcp_content(self, content_config: Dict, session_data: Dict[str, Any]) -> str:
        """Call MCP server and return formatted output"""
        mcp_server = content_config.get("server", "")
        mcp_method = content_config.get("method", "")
        mcp_params = content_config.get("params", {})
        
        if not mcp_server or not mcp_method:
            return "Error: MCP server or method not specified"
            
        try:
            # Import MCP functionality (would need to be implemented)
            # This is a placeholder for MCP integration
            from ..mcp.base import get_mcp_server
            
            server = get_mcp_server(mcp_server)
            if not server:
                return f"Error: MCP server '{mcp_server}' not found"
                
            result = await server.call_method(mcp_method, mcp_params)
            return str(result)
            
        except Exception as e:
            log.error(f"Error calling MCP server: {e}")
            return f"MCP error: {str(e)}"
            
    async def _process_agent_content(self, content_config: Dict, session_data: Dict[str, Any], working_dir: str) -> str:
        """Process script/MCP output through Claude agent for formatting"""
        
        # First get the raw content
        if "script" in content_config:
            raw_content = await self._process_script_content(content_config, session_data, working_dir)
        elif "mcp" in content_config:
            raw_content = await self._process_mcp_content(content_config.get("mcp", {}), session_data)
        else:
            raw_content = content_config.get("raw_content", "")
            
        if not raw_content or raw_content.startswith("Error:"):
            return raw_content
            
        # Process through Claude agent
        agent_prompt = content_config.get("agent_prompt", "Format this content in a friendly, concise way")
        
        try:
            # Create a temporary prompt for Claude
            full_prompt = f"""
{agent_prompt}

Raw content to format:
{raw_content}

Please format this as a brief, friendly notification suitable for display at the top of a conversation interface. Keep it concise but informative.
"""

            # Use Claude client to process (would need session access)
            # This is a simplified implementation
            from ..voice_assistant.claude.client import ClaudeClient
            
            claude_client = ClaudeClient(
                working_directory=working_dir,
                conversation_history=[]
            )
            
            result = await claude_client.execute_async(full_prompt)
            
            if result["success"]:
                return result["response"].strip()
            else:
                log.error(f"Claude processing failed: {result['response']}")
                return f"Agent processing error: {result['response']}"
                
        except Exception as e:
            log.error(f"Error processing content through agent: {e}")
            return f"Agent error: {str(e)}"
            
    def clear_cache(self, working_dir: Optional[str] = None):
        """Clear notification cache for specific workspace or all"""
        if working_dir:
            keys_to_remove = [key for key in self.cache.keys() if key.startswith(working_dir)]
            for key in keys_to_remove:
                del self.cache[key]
        else:
            self.cache.clear()
            self.cache_ttl.clear()


# Global instance
notification_manager = NotificationManager()