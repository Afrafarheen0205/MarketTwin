from typing import Optional
from pydantic import BaseModel, EmailStr


class UserProfile(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "customer"
    company: Optional[str] = None


class CustomerProfile(BaseModel):
    id: str
    tax_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    status: str = "Active"


class MerchantProfile(BaseModel):
    id: str
    contact_name: Optional[str] = None
    category: Optional[str] = None
    rating: float = 0
    status: str = "Under Review"