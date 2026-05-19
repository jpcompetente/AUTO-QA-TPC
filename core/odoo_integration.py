"""
Odoo XML-RPC and JSON-RPC integration service for fetching Manufacturing Orders (MOs) and Product details.
Prepopulates ActiveConfiguration and ManufacturingOrderSession from Odoo.
"""

import logging
from typing import Any, Dict, Optional, List
from django.conf import settings
from django.contrib.auth.models import User
from celery import shared_task
import requests
import xmlrpc.client

from .models import (
    AIModel,
    ActiveConfiguration,
    ComponentType,
    ManufacturingOrderSession,
)

logger = logging.getLogger(__name__)


class OdooConnector:
    """
    Handles connection and communication with Odoo API using XML-RPC or JSON-RPC.
    """

    def __init__(self):
        self.odoo_url = getattr(settings, 'ODOO_URL', 'http://localhost:8069')
        self.odoo_db = getattr(settings, 'ODOO_DATABASE', 'odoo_db')
        self.odoo_username = getattr(settings, 'ODOO_USERNAME', 'admin')
        self.odoo_password = getattr(settings, 'ODOO_PASSWORD', 'admin')
        self.use_json_rpc = getattr(settings, 'ODOO_USE_JSON_RPC', False)
        self.uid = None
        self.authenticated = False

    def authenticate_xml_rpc(self) -> bool:
        """Authenticate with Odoo using XML-RPC"""
        try:
            common = xmlrpc.client.ServerProxy(f"{self.odoo_url}/xmlrpc/2/common")
            self.uid = common.authenticate(
                self.odoo_db,
                self.odoo_username,
                self.odoo_password,
                {}
            )
            self.authenticated = self.uid is not False
            logger.info(f"Odoo XML-RPC authentication: {'Success' if self.authenticated else 'Failed'}")
            return self.authenticated
        except Exception as e:
            logger.error(f"Odoo XML-RPC authentication error: {e}")
            return False

    def authenticate_json_rpc(self) -> bool:
        """Authenticate with Odoo using JSON-RPC"""
        try:
            auth_url = f"{self.odoo_url}/web/session/authenticate"
            response = requests.post(
                auth_url,
                json={
                    'jsonrpc': '2.0',
                    'method': 'call',
                    'params': {
                        'login': self.odoo_username,
                        'password': self.odoo_password,
                        'db': self.odoo_db,
                    },
                    'id': 0,
                },
                timeout=10
            )
            self.authenticated = response.status_code == 200
            logger.info(f"Odoo JSON-RPC authentication: {'Success' if self.authenticated else 'Failed'}")
            return self.authenticated
        except Exception as e:
            logger.error(f"Odoo JSON-RPC authentication error: {e}")
            return False

    def authenticate(self) -> bool:
        """Authenticate with Odoo"""
        if self.use_json_rpc:
            return self.authenticate_json_rpc()
        else:
            return self.authenticate_xml_rpc()

    def fetch_manufacturing_orders_xml_rpc(
        self,
        limit: int = 10,
        state: str = 'confirmed'
    ) -> List[Dict[str, Any]]:
        """Fetch Manufacturing Orders from Odoo using XML-RPC"""
        if not self.authenticated:
            return []

        try:
            models = xmlrpc.client.ServerProxy(f"{self.odoo_url}/xmlrpc/2/object")
            # Search for MOs with specified state
            mo_ids = models.execute_kw(
                self.odoo_db,
                self.uid,
                self.odoo_password,
                'mrp.production',
                'search',
                [[('state', '=', state)]],
                {'limit': limit}
            )

            # Read MO details
            mos = models.execute_kw(
                self.odoo_db,
                self.uid,
                self.odoo_password,
                'mrp.production',
                'read',
                [mo_ids],
                {
                    'fields': [
                        'id', 'name', 'product_id', 'product_qty',
                        'state', 'date_start', 'date_finished'
                    ]
                }
            )
            return mos
        except Exception as e:
            logger.error(f"Error fetching MOs via XML-RPC: {e}")
            return []

    def fetch_manufacturing_orders_json_rpc(
        self,
        limit: int = 10,
        state: str = 'confirmed'
    ) -> List[Dict[str, Any]]:
        """Fetch Manufacturing Orders from Odoo using JSON-RPC"""
        if not self.authenticated:
            return []

        try:
            url = f"{self.odoo_url}/web/dataset/search_read"
            response = requests.post(
                url,
                json={
                    'jsonrpc': '2.0',
                    'method': 'call',
                    'params': {
                        'model': 'mrp.production',
                        'domain': [['state', '=', state]],
                        'fields': [
                            'id', 'name', 'product_id', 'product_qty',
                            'state', 'date_start', 'date_finished'
                        ],
                        'limit': limit,
                    },
                    'id': 0,
                },
                timeout=10
            )
            data = response.json()
            if 'result' in data:
                return data['result']['records']
            return []
        except Exception as e:
            logger.error(f"Error fetching MOs via JSON-RPC: {e}")
            return []

    def fetch_manufacturing_orders(
        self,
        limit: int = 10,
        state: str = 'confirmed'
    ) -> List[Dict[str, Any]]:
        """Fetch Manufacturing Orders from Odoo"""
        if self.use_json_rpc:
            return self.fetch_manufacturing_orders_json_rpc(limit=limit, state=state)
        else:
            return self.fetch_manufacturing_orders_xml_rpc(limit=limit, state=state)

    def fetch_product_details_xml_rpc(self, product_id: int) -> Optional[Dict[str, Any]]:
        """Fetch Product details from Odoo using XML-RPC"""
        if not self.authenticated:
            return None

        try:
            models = xmlrpc.client.ServerProxy(f"{self.odoo_url}/xmlrpc/2/object")
            product = models.execute_kw(
                self.odoo_db,
                self.uid,
                self.odoo_password,
                'product.product',
                'read',
                [product_id],
                {'fields': ['id', 'name', 'default_code', 'description']}
            )
            return product[0] if product else None
        except Exception as e:
            logger.error(f"Error fetching product details via XML-RPC: {e}")
            return None

    def fetch_product_details_json_rpc(self, product_id: int) -> Optional[Dict[str, Any]]:
        """Fetch Product details from Odoo using JSON-RPC"""
        if not self.authenticated:
            return None

        try:
            url = f"{self.odoo_url}/web/dataset/call_kw/product.product/read"
            response = requests.post(
                url,
                json={
                    'jsonrpc': '2.0',
                    'method': 'call',
                    'params': {
                        'args': [[product_id]],
                        'kwargs': {
                            'fields': ['id', 'name', 'default_code', 'description']
                        },
                    },
                    'id': 0,
                },
                timeout=10
            )
            data = response.json()
            if 'result' in data and data['result']:
                return data['result'][0]
            return None
        except Exception as e:
            logger.error(f"Error fetching product details via JSON-RPC: {e}")
            return None

    def fetch_product_details(self, product_id: int) -> Optional[Dict[str, Any]]:
        """Fetch Product details from Odoo"""
        if self.use_json_rpc:
            return self.fetch_product_details_json_rpc(product_id)
        else:
            return self.fetch_product_details_xml_rpc(product_id)


class OdooSyncService:
    """
    Sync Odoo MOs and Products into the system's ActiveConfiguration and ManufacturingOrderSession.
    """

    def __init__(self):
        self.connector = OdooConnector()
        self.connector.authenticate()

    def sync_manufacturing_order(
        self,
        operator: User,
        mo_name: str,
        mo_id: Optional[int] = None,
        odoo_product_id: Optional[int] = None
    ) -> Optional[ManufacturingOrderSession]:
        """
        Sync a single Manufacturing Order from Odoo to create/update ManufacturingOrderSession.
        """
        try:
            # Fetch MO details from Odoo
            mos = self.connector.fetch_manufacturing_orders(limit=1, state='confirmed')
            if not mos:
                logger.warning(f"MO {mo_name} not found in Odoo")
                return None

            mo = mos[0]
            product_id = mo.get('product_id')
            if isinstance(product_id, (list, tuple)):
                product_id = product_id[0]

            # Fetch product details
            product_details = self.connector.fetch_product_details(product_id)
            if not product_details:
                logger.warning(f"Product {product_id} not found in Odoo")
                return None

            # Get or create ComponentType
            component_name = product_details.get('name', f'Product {product_id}')
            component, _ = ComponentType.objects.get_or_create(
                name=component_name,
                defaults={'description': product_details.get('description', '')}
            )

            # Get the active model for this product
            active_config = ActiveConfiguration.objects.filter(
                operator=operator,
                product=component,
                is_active=True
            ).select_related('model').first()

            active_model = active_config.model if active_config else None

            # Get or create ManufacturingOrderSession
            mo_session, created = ManufacturingOrderSession.objects.get_or_create(
                manufacturing_order=mo_name,
                defaults={
                    'operator': operator,
                    'product': component,
                    'active_model': active_model,
                    'odoo_mo_id': str(mo.get('id', '')),
                    'odoo_product_id': str(product_id),
                    'total_product_count': int(mo.get('product_qty', 0)),
                }
            )

            if created:
                logger.info(f"Created new MO session for {mo_name}")
            else:
                # Reset product count for existing MO
                mo_session.reset_product_count()
                logger.info(f"Reset product count for existing MO {mo_name}")

            return mo_session
        except Exception as e:
            logger.error(f"Error syncing MO {mo_name}: {e}")
            return None

    def sync_all_manufacturing_orders(self, operator: User, limit: int = 10):
        """
        Sync all confirmed Manufacturing Orders from Odoo.
        """
        try:
            mos = self.connector.fetch_manufacturing_orders(limit=limit, state='confirmed')
            synced_count = 0

            for mo in mos:
                mo_session = self.sync_manufacturing_order(
                    operator=operator,
                    mo_name=mo.get('name', ''),
                    mo_id=mo.get('id'),
                    odoo_product_id=mo.get('product_id')
                )
                if mo_session:
                    synced_count += 1

            logger.info(f"Synced {synced_count} MOs for operator {operator.username}")
            return synced_count
        except Exception as e:
            logger.error(f"Error syncing all MOs: {e}")
            return 0


# Celery task for background MO sync (to prevent UI lag)
@shared_task(bind=True)
def sync_manufacturing_orders_task(self, operator_id: int, limit: int = 10):
    """
    Background task to fetch and sync MOs from Odoo without blocking the request.
    """
    try:
        operator = User.objects.get(id=operator_id)
        service = OdooSyncService()
        synced = service.sync_all_manufacturing_orders(operator=operator, limit=limit)
        logger.info(f"Celery task: Synced {synced} MOs for operator {operator.username}")
        return {'status': 'success', 'synced_count': synced}
    except Exception as e:
        logger.error(f"Celery task error: {e}")
        return {'status': 'error', 'message': str(e)}


def trigger_odoo_sync_background(operator: User, limit: int = 10):
    """
    Trigger the Celery background task to sync MOs without blocking.
    """
    try:
        sync_manufacturing_orders_task.delay(operator.id, limit)
        logger.info(f"Triggered background MO sync for operator {operator.username}")
    except Exception as e:
        logger.error(f"Error triggering background sync: {e}")
