"""Base class for MCP servers"""

from abc import ABC, abstractmethod
from mcp.server.fastmcp import FastMCP
from typing import List, Dict, Any


class BaseMCPServer(ABC):
    """Base class for MCP server implementations"""

    def __init__(self, name: str, description: str = ""):
        """
        Initialize MCP server

        Args:
            name: Server name
            description: Server description
        """
        self.name = name
        self.description = description
        self.mcp = FastMCP(name)
        self._register_handlers()

    @abstractmethod
    def _register_handlers(self):
        """Register tool and resource handlers - must be implemented by subclasses"""
        pass

    @abstractmethod
    def get_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of available tools

        Returns:
            List of tool definitions
        """
        pass

    def run(self):
        """Start the MCP server"""
        self.mcp.run()

    def __repr__(self):
        return f"<{self.__class__.__name__} name='{self.name}'>"
