export interface Assignment {
  assignmentId: string; orderId: string; orderNumber: string; status: string; orderStatus: string; distanceKm: number | null; earningPaise: number; offerExpiresAt: string | null;
  paymentMethod: string; collectPaise: number; pickup: { name: string; address: string; lat: number; lng: number } | null; drop: { area: string; lat: number | null; lng: number | null };
  acceptedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; items: { productName: string; variantLabel: string; quantity: number }[];
  customer: { name: string; phone: string; address: string; instructions: string | null } | null; navigation: { toStore: string | null; toCustomer: string };
}
export interface Partner {
  id: string; status: string; statusReason: string | null; vehicleType: string; vehicleNumber: string | null; licenseNumber: string | null; city: string; isOnline: boolean; rating: number; totalDeliveries: number;
  bankAccountName: string | null; bankAccountLast4: string | null; bankIfsc: string | null; upiId: string | null; emergencyContact: string | null;
  user: { name: string; phone: string | null; email: string | null; avatarUrl: string | null };
  documents: { id: string; type: string; status: string; rejectionReason: string | null; uploadedAt: string }[]; missingDocuments: string[];
}
export interface Earnings { todayPaise: number; last7DaysPaise: number; last30DaysPaise: number; unsettledPaise: number; deliveriesToday: number; incentive: { target: number; bonusPaise: number; progress: number; achieved: boolean } }
