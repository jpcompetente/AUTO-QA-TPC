"""
Model Loading & Hot-Swapping Utility
Requirement 1.2: Model & Version Management - Hot-swap models without restarting server
"""

import logging
import os
from pathlib import Path
from typing import Dict, Optional, Tuple
import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class ModelLoader:
    """
    Manages AI model loading, caching, and hot-swapping
    Supports .pt, .onnx, and .engine formats
    """
    
    _instance = None
    _model_cache: Dict = {}
    _active_model = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelLoader, cls).__new__(cls)
        return cls._instance
    
    @staticmethod
    def get_instance():
        """Get singleton instance"""
        return ModelLoader()
    
    def load_model(self, model_path: str, model_format: str = 'pt', device: str = 'cuda' if torch.cuda.is_available() else 'cpu'):
        """
        Load a model from file
        
        Args:
            model_path: Path to model file (.pt, .onnx, or .engine)
            model_format: Model format ('pt', 'onnx', 'engine')
            device: Device to load model on ('cuda' or 'cpu')
        
        Returns:
            Loaded model object
        """
        try:
            # Check cache first
            cache_key = f"{model_path}_{device}_{model_format}"
            if cache_key in self._model_cache:
                logger.info(f"Loading model from cache: {model_path}")
                return self._model_cache[cache_key]
            
            # Verify file exists
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Model file not found: {model_path}")
            
            logger.info(f"Loading model: {model_path} (format: {model_format}, device: {device})")
            
            # Load based on format
            if model_format == 'pt':
                model = YOLO(model_path)
                # Optimize for inference
                model = model.to(device)
            elif model_format == 'onnx':
                import onnxruntime as ort
                model = ort.InferenceSession(model_path, providers=['CUDAExecutionProvider' if device == 'cuda' else 'CPUExecutionProvider'])
            elif model_format == 'engine':
                # TensorRT engine
                import tensorrt as trt
                logger.info("Loading TensorRT engine")
                # Implementation depends on your TensorRT setup
                model = self._load_tensorrt_engine(model_path, device)
            else:
                raise ValueError(f"Unsupported model format: {model_format}")
            
            # Cache the model
            self._model_cache[cache_key] = model
            logger.info(f"Model loaded successfully: {model_path}")
            
            return model
            
        except Exception as e:
            logger.error(f"Error loading model {model_path}: {str(e)}")
            raise
    
    def set_active_model(self, model):
        """Set the active model for inference"""
        self._active_model = model
        logger.info("Active model updated")
    
    def get_active_model(self):
        """Get the currently active model"""
        return self._active_model
    
    def hot_swap_model(self, new_model_path: str, model_format: str = 'pt') -> bool:
        """
        Hot-swap to a new model without restarting server
        
        Args:
            new_model_path: Path to new model file
            model_format: Model format
        
        Returns:
            Success status
        """
        try:
            logger.info(f"Initiating hot-swap to model: {new_model_path}")
            
            # Load new model
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            new_model = self.load_model(new_model_path, model_format, device)
            
            # Update active model
            self.set_active_model(new_model)
            
            logger.info(f"Hot-swap successful: {new_model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Hot-swap failed: {str(e)}")
            return False
    
    def unload_model(self, model_path: str):
        """Remove a model from cache"""
        try:
            keys_to_remove = [k for k in self._model_cache.keys() if model_path in k]
            for key in keys_to_remove:
                del self._model_cache[key]
                logger.info(f"Model unloaded from cache: {model_path}")
        except Exception as e:
            logger.error(f"Error unloading model: {str(e)}")
    
    def clear_cache(self):
        """Clear all cached models"""
        self._model_cache.clear()
        logger.info("Model cache cleared")
    
    def get_cache_info(self) -> Dict:
        """Get cache statistics"""
        return {
            'cached_models': len(self._model_cache),
            'model_paths': list(self._model_cache.keys()),
            'active_model': str(self._active_model)
        }
    
    @staticmethod
    def _load_tensorrt_engine(engine_path: str, device: str):
        """Load TensorRT engine"""
        try:
            import tensorrt as trt
            logger.info("Loading TensorRT engine from: {engine_path}")
            
            with open(engine_path, 'rb') as f:
                engine_data = f.read()
            
            logger.warning("TensorRT support requires additional setup. Placeholder implementation.")
            # Implement based on your TensorRT requirements
            
        except ImportError:
            logger.error("TensorRT not installed. Install with: pip install tensorrt")
            raise
    
    @staticmethod
    def estimate_memory_usage(model_path: str) -> Dict:
        """Estimate GPU/CPU memory usage for a model"""
        try:
            file_size = os.path.getsize(model_path) / (1024 * 1024)  # MB
            
            # YOLO v8 models: ~3.2x file size in GPU memory
            estimated_gpu = file_size * 3.2
            estimated_cpu = file_size * 2
            
            return {
                'file_size_mb': round(file_size, 2),
                'estimated_gpu_memory_mb': round(estimated_gpu, 2),
                'estimated_cpu_memory_mb': round(estimated_cpu, 2),
            }
        except Exception as e:
            logger.error(f"Error estimating memory: {str(e)}")
            return {}


# Singleton instance
model_loader = ModelLoader.get_instance()
