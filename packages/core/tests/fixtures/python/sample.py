"""
Sample Python file for testing
"""

import os
import sys
from typing import List, Dict, Optional

class DataProcessor:
    """A sample data processor class"""
    
    def __init__(self, config: Dict[str, str]):
        self.config = config
        self._cache = {}
    
    def process_data(self, data: List[str]) -> List[str]:
        """Process a list of data items"""
        results = []
        
        for item in data:
            if item and len(item) > 0:
                processed = self._process_item(item)
                results.append(processed)
        
        return results
    
    def _process_item(self, item: str) -> str:
        """Private method to process individual items"""
        return item.upper()
    
    def get_cache_size(self) -> int:
        """Get the current cache size"""
        return len(self._cache)

def calculate_fibonacci(n: int) -> int:
    """Calculate the nth Fibonacci number"""
    if n <= 1:
        return n
    
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    
    return b

async def async_operation(data: str) -> str:
    """An async function for testing"""
    await asyncio.sleep(0.1)
    return data.upper()

# Private function
def _helper_function():
    """This is a private helper function"""
    pass

# Module-level variable
API_VERSION = "1.0.0"
